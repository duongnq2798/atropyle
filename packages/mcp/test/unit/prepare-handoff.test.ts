import { type AtropyleClient, AtropyleError, type TxPlan } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { OKX_NOTE, prepareCreateVault } from '../../src/ops/index';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as const;
const step = {
  chainId: 31337,
  from: A(1),
  to: A(2),
  data: '0x1234',
  value: 0n,
  action: 'checkIn',
  summary: 'Check in.',
  warnings: [],
  simulation: { ok: true, gas: 21000n },
} as const;

const noWebApp = () => {
  throw new AtropyleError('INVALID_OPTIONS', { message: 'This deployment has no web app URL; pass `base`.' });
};

function stub(o: {
  steps?: TxPlan['steps'];
  webUrl?: string | null;
  rpcUrl?: string;
  link?: () => string;
  cast?: () => string;
}) {
  const rpcUrl = o.rpcUrl ?? 'http://127.0.0.1:8545';
  const plan = { chainId: 31337, from: A(1), vault: A(9), steps: o.steps ?? [step], summary: 'Plan.', warnings: [] };
  return {
    deployment: { webUrl: o.webUrl ?? null, rpcUrls: [rpcUrl] },
    prepare: { createVault: async () => plan },
    handoff: {
      link: o.link ?? noWebApp,
      cast: o.cast ?? (() => `cast send --rpc-url ${rpcUrl}`),
      okx: () => 'onchainos wallet contract-call',
      calls: () => ({ version: '2.0.0', chainId: '0x7a69', from: A(1), atomicRequired: false, calls: [] }),
    },
  } as unknown as AtropyleClient;
}
const input = { plan: { heirs: [], timing: 'drill' as const }, owner: A(1) };

describe('handoff edge cases', () => {
  it('a deployment without a web app URL still gives cast and calls, and says why there is no link', async () => {
    const out = await prepareCreateVault(stub({}), input);
    expect(out.handoff).toMatchObject({
      link: null,
      okxAppLink: null,
      cast: ['cast send --rpc-url http://127.0.0.1:8545'],
    });
    expect(out.handoff?.notes.join(' ')).toContain('no web app URL');
  });

  it('rethrows INVALID_OPTIONS from the link when a web app URL exists', async () => {
    const badBase = () => {
      throw new AtropyleError('INVALID_OPTIONS', { message: 'The base of a signing link must be an http(s) URL.' });
    };
    await expect(
      prepareCreateVault(stub({ webUrl: 'http://localhost:5173', link: badBase }), input),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(prepareCreateVault(stub({ link: badBase }), { ...input, webUrl: 'ftp://nope' })).rejects.toMatchObject(
      {
        code: 'INVALID_OPTIONS',
      },
    );
  });

  it('does not swallow other errors from the link or from cast', async () => {
    const boom = () => {
      throw new AtropyleError('UNKNOWN');
    };
    await expect(prepareCreateVault(stub({ link: boom }), input)).rejects.toMatchObject({ code: 'UNKNOWN' });
    await expect(prepareCreateVault(stub({ link: () => 'x', cast: boom }), input)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('a 2-step plan whose step 2 fails simulation has no handoff and names step 2', async () => {
    const failing = { ...step, simulation: { ok: false, error: new AtropyleError('NOT_GUARDIAN').toJSON() } };
    const out = await prepareCreateVault(stub({ steps: [step, failing] as never }), input);
    expect(out.handoff).toBeNull();
    expect(out.blocked?.step).toBe(1);
    expect(out.summary).toContain('Step 2 of 2');
  });

  it('a skipped step keeps the handoff and is called out in the notes', async () => {
    const skipped = { ...step, simulation: { ok: 'skipped', reason: 'DEPENDS_ON_PREVIOUS_STEP' } };
    const out = await prepareCreateVault(stub({ steps: [step, skipped] as never }), input);
    expect(out.blocked).toBeNull();
    expect(out.handoff?.cast).toHaveLength(2);
    expect(out.handoff?.calls).toBeDefined();
    expect(out.handoff?.notes.join(' ')).toContain('Step 2 was not simulated on its own: it depends on step 1');
  });

  it('keeps an API key in the RPC URL path out of the cast commands', async () => {
    const out = await prepareCreateVault(stub({ rpcUrl: 'https://rpc.example.com/v2/SECRETKEY' }), input);
    expect(JSON.stringify(out)).not.toContain('SECRETKEY');
    expect(out.handoff?.cast[0]).toContain('"$ETH_RPC_URL"');
    expect(out.handoff?.notes.join(' ')).toContain('cast commands use $ETH_RPC_URL');
  });

  it('prints an origin-only RPC URL as before', async () => {
    const out = await prepareCreateVault(stub({ rpcUrl: 'https://rpc.xlayer.tech' }), input);
    expect(out.handoff?.cast[0]).toContain('https://rpc.xlayer.tech');
    expect(out.handoff?.notes.join(' ')).not.toContain('ETH_RPC_URL');
  });

  it('a step with native value gives no okx commands and no OKX note', async () => {
    const out = await prepareCreateVault(stub({ steps: [step, { ...step, value: 1n }] as never }), input);
    expect(out.handoff?.okx).toBeNull();
    expect(out.handoff?.cast).toHaveLength(2);
    expect(out.handoff?.notes).not.toContain(OKX_NOTE);
  });

  it('a plan without native value has the okx commands and the OKX note', async () => {
    const out = await prepareCreateVault(stub({}), input);
    expect(out.handoff?.okx).toEqual(['onchainos wallet contract-call']);
    expect(out.handoff?.notes).toContain(OKX_NOTE);
  });

  it('a plan with no steps has no handoff and nothing to sign', async () => {
    const out = await prepareCreateVault(stub({ steps: [] }), input);
    expect(out.handoff).toBeNull();
    expect(out.blocked).toBeNull();
    expect(out.summary).toContain('nothing to sign');
  });
});
