import {
  type AtropyleClient,
  AtropyleError,
  GUARDIAN_WARNING,
  type InspectedStep,
  type SignPayload,
  type SignRequestCheck,
} from '@atropyle/sdk';
import type { Address, WalletClient } from 'viem';
import { describe, expect, it } from 'vitest';
import { checkToPlan, sendSignRequest, signView } from '../../src/lib/sign';
import type { Eip1193 } from '../../src/lib/wallet';

const A: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const B: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const V: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

function step(over: Partial<InspectedStep> = {}): InspectedStep {
  return {
    index: 0,
    to: V,
    value: 0n,
    action: 'checkIn',
    summary: `Check in as the owner of vault ${V}: this resets the inactivity timer and clears pending guardian votes.`,
    warnings: [],
    allowed: true,
    reason: null,
    builderCodes: null,
    simulation: { ok: true, gas: 50_000n },
    ...over,
  };
}

function check(steps: InspectedStep[], over: Partial<SignRequestCheck> = {}): SignRequestCheck {
  return {
    ok: steps.every((s) => s.allowed && s.simulation.ok !== false),
    chainId: 196,
    from: A,
    vault: V,
    steps,
    ...over,
  };
}

const payload: SignPayload = { chainId: 196, from: A, steps: [{ to: V, data: '0x183ff085', value: 0n }] };
const ready = { account: A, chainId: 196 };

describe('signView', () => {
  it('signView refuses a step outside the whitelist', () => {
    const bad = step({
      index: 1,
      to: B,
      action: null,
      summary: null,
      allowed: false,
      reason: `unknown call to ${B}`,
      simulation: { ok: 'skipped', reason: 'NOT_ALLOWED' },
    });
    const v = signView(check([step(), bad]), ready, 196);
    expect(v.verdict).toBe('refused');
    expect(v.canSign).toBe(false);
    expect(v.refused.map((s) => s.index)).toEqual([1]);
  });

  it('refuses a request made for another chain', () => {
    expect(signView(check([step()], { chainId: 1 }), ready, 196).verdict).toBe('refused');
  });

  it('refuses a request with no step', () => {
    expect(signView(check([]), ready, 196)).toMatchObject({ verdict: 'refused', canSign: false });
  });

  it('blocks a step whose simulation fails', () => {
    const failing = step({ simulation: { ok: false, error: new AtropyleError('NOT_OWNER').toJSON() } });
    const v = signView(check([failing]), ready, 196);
    expect(v).toMatchObject({ verdict: 'simulationFailed', canSign: false });
    expect(v.failed).toHaveLength(1);
  });

  it('asks to connect, then for the right account, then allows a chain switch', () => {
    const c = check([step()]);
    expect(signView(c, null, 196)).toMatchObject({ verdict: 'connect', canSign: false });
    expect(signView(c, { account: B, chainId: 196 }, 196)).toMatchObject({ verdict: 'wrongAccount', canSign: false });
    expect(signView(c, { account: A, chainId: 1 }, 196)).toMatchObject({ verdict: 'wrongChain', canSign: true });
    expect(signView(c, ready, 196)).toMatchObject({ verdict: 'ready', canSign: true, guardianWarning: false });
  });

  it('flags guardian actions', () => {
    expect(signView(check([step({ action: 'voteRecovery' })]), ready, 196).guardianWarning).toBe(true);
    expect(signView(check([step({ action: 'attestDeath' })]), ready, 196).guardianWarning).toBe(true);
    expect(signView(check([step({ warnings: [GUARDIAN_WARNING] })]), ready, 196).guardianWarning).toBe(true);
  });
});

describe('checkToPlan', () => {
  it('rebuilds the plan from the payload bytes and the inspected summaries', () => {
    const plan = checkToPlan(payload, check([step()]));
    expect(plan).toMatchObject({ chainId: 196, from: A, vault: V });
    expect(plan.steps[0]).toMatchObject({
      to: V,
      data: '0x183ff085',
      value: 0n,
      action: 'checkIn',
      simulation: { ok: true, gas: 50_000n },
    });
    expect(plan.steps[0].summary).toContain('Check in as the owner');
    expect(plan.warnings).toEqual([]);
  });

  it('adds the guardian warning to guardian votes', () => {
    const plan = checkToPlan(payload, check([step({ action: 'voteRecovery', warnings: [GUARDIAN_WARNING] })]));
    expect(plan.warnings.map((w) => w.code)).toEqual(['GUARDIAN_VERIFY_OUT_OF_BAND']);
  });

  it('keeps the warnings that inspect rebuilt for each step', () => {
    const w = { code: 'UNLIMITED_APPROVAL', message: 'Unlimited approval.' } as const;
    const plan = checkToPlan(payload, check([step({ warnings: [w] })]));
    expect(plan.steps[0].warnings).toEqual([w]);
  });

  it('refuses a check that does not match the payload', () => {
    const code = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as AtropyleError).code;
      }
      return null;
    };
    expect(code(() => checkToPlan(payload, check([step(), step({ index: 1 })])))).toBe('LINK_INVALID');
    expect(code(() => checkToPlan(payload, check([step({ to: B })])))).toBe('LINK_INVALID');
    expect(code(() => checkToPlan(payload, check([step({ allowed: false })], { ok: false })))).toBe('LINK_INVALID');
  });
});

describe('sendSignRequest', () => {
  const wc = {} as WalletClient;

  function fakes(c: SignRequestCheck, rpc: (method: string) => unknown) {
    const methods: string[] = [];
    const sent: unknown[] = [];
    const atro = {
      handoff: { inspect: async () => c, calls: () => ({ calls: [] }) },
      send: async (plan: unknown) => {
        sent.push(plan);
        return { vault: V, steps: [] };
      },
    } as unknown as AtropyleClient;
    const provider = {
      request: async ({ method }: { method: string }) => {
        methods.push(method);
        return rpc(method);
      },
    } as unknown as Eip1193;
    return { atro, provider, methods, sent };
  }

  it('sends nothing to the wallet when the re-inspection refuses', async () => {
    const f = fakes(check([step({ allowed: false })], { ok: false }), () => ({}));
    const out = await sendSignRequest({ atro: f.atro, provider: f.provider, walletClient: wc }, payload);
    expect(out.kind).toBe('refused');
    expect(f.methods).toEqual([]);
    expect(f.sent).toEqual([]);
  });

  it('batches with wallet_sendCalls when the wallet supports it', async () => {
    const f = fakes(check([step()]), (m) => {
      if (m === 'wallet_getCapabilities') return { '0xc4': {} };
      if (m === 'wallet_sendCalls') return { id: 'b1' };
      return { status: 200, receipts: [{ transactionHash: `0x${'12'.repeat(32)}`, status: '0x1' }] };
    });
    const out = await sendSignRequest({ atro: f.atro, provider: f.provider, walletClient: wc }, payload);
    expect(out).toMatchObject({ kind: 'sendCalls', result: { ok: true } });
    expect(f.sent).toEqual([]);
  });

  it('falls back to one transaction at a time when the wallet rejects wallet_sendCalls', async () => {
    const f = fakes(check([step()]), (m) => {
      if (m === 'wallet_getCapabilities') return { '0xc4': {} };
      throw Object.assign(new Error('unsupported'), { code: 4200 });
    });
    const out = await sendSignRequest({ atro: f.atro, provider: f.provider, walletClient: wc }, payload);
    expect(out.kind).toBe('sequential');
    expect(f.sent).toHaveLength(1);
  });
});
