// @vitest-environment happy-dom
import {
  AtropyleError,
  GUARDIAN_WARNING,
  type InspectedStep,
  type SignPayload,
  type SignRequestCheck,
  sendCallsParams,
  vaultAbi,
} from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import { type Address, encodeFunctionData } from 'viem';
import { afterEach, describe, expect, it } from 'vitest';
import type { Sdk } from '../../src/lib/sdk';
import { SignPage } from '../../src/pages/sign';
import { AppContext } from '../../src/ui/app-context';

afterEach(cleanup);

const A: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

function step(over: Partial<InspectedStep> = {}): InspectedStep {
  return {
    index: 0,
    to: V,
    value: 0n,
    action: 'checkIn',
    summary: 'Check in.',
    warnings: [],
    allowed: true,
    reason: null,
    builderCodes: null,
    simulation: { ok: true, gas: 50_000n },
    ...over,
  };
}

function page(steps: InspectedStep[], over: Partial<SignRequestCheck> = {}) {
  const check: SignRequestCheck = {
    ok: steps.every((s) => s.allowed && s.simulation.ok !== false),
    chainId: 196,
    from: A,
    vault: V,
    steps,
    ...over,
  };
  const sdk = {
    atro: {
      chain: { id: 196 },
      handoff: {
        parse: () => ({ chainId: 196, from: A, steps: [] }),
        inspect: async () => check,
      },
    },
    deployment: { explorerUrl: null },
  } as unknown as Sdk;
  const value = {
    lang: 'en',
    env: { docsPath: null },
    sdk,
    wallet: { account: A, chainId: 196, option: { provider: {} } },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  return (
    <AppContext.Provider value={value}>
      <SignPage sdk={sdk} />
    </AppContext.Provider>
  );
}

describe('SignPage', () => {
  it('shows the unlimited approval warning that inspect rebuilt', async () => {
    const w = { code: 'UNLIMITED_APPROVAL', message: 'This approval has no limit.' } as const;
    render(page([step({ action: 'approve', warnings: [w] })]));
    await waitFor(() => expect(screen.getByTestId('warning-UNLIMITED_APPROVAL')).toBeTruthy());
    expect(screen.getByTestId('warning-UNLIMITED_APPROVAL').textContent).toContain('no limit');
    expect(screen.getByTestId('sign-send')).toBeTruthy();
  });

  it('shows the guardian warning once, in its own banner', async () => {
    render(page([step({ action: 'voteRecovery', warnings: [GUARDIAN_WARNING] })]));
    await waitFor(() => expect(screen.getByTestId('sign-guardian')).toBeTruthy());
    expect(screen.queryByTestId(`warning-${GUARDIAN_WARNING.code}`)).toBeNull();
  });

  it('offers no sign button for a refused step', async () => {
    const bad = step({
      action: null,
      summary: null,
      allowed: false,
      reason: 'unknown call',
      simulation: { ok: 'skipped', reason: 'NOT_ALLOWED' },
    });
    render(page([bad]));
    await waitFor(() => expect(screen.getByTestId('sign-refused')).toBeTruthy());
    expect(screen.queryByTestId('sign-send')).toBeNull();
  });
});

const H1 = `0x${'11'.repeat(32)}` as const;
const raw = { to: V, data: '0x', value: 0n } as const;

interface Rig {
  steps?: number;
  /** wallet_getCallsStatus reply; undefined means the wallet cannot batch. */
  bundle?: unknown;
  send?: (plan: { steps: unknown[] }, w: unknown, o: { onStep?: (e: unknown) => void }) => Promise<unknown>;
  inspected?: SignPayload[];
  refuseSlice?: boolean;
}

function rig(r: Rig = {}) {
  const n = r.steps ?? 1;
  const inspected = r.inspected ?? [];
  const sdk = {
    atro: {
      chain: { id: 196 },
      handoff: {
        parse: (h: string) => ({ chainId: 196, from: A, steps: Array.from({ length: n }, () => raw), tag: h }),
        inspect: async (p: SignPayload) => {
          inspected.push(p);
          const steps = p.steps.map((_, index) => step({ index }));
          const ok = !(r.refuseSlice && p.steps.length < n);
          return { ok, chainId: 196, from: A, vault: V, steps: ok ? steps : [step({ allowed: false })] };
        },
        calls: () => ({ calls: [] }),
      },
      send: r.send ?? (async () => ({ vault: V, steps: [] })),
    },
    deployment: { explorerUrl: null },
  } as unknown as Sdk;
  const provider = {
    request: async ({ method }: { method: string }) => {
      if (r.bundle === undefined) throw Object.assign(new Error('no'), { code: 4200 });
      if (method === 'wallet_getCapabilities') return { '0xc4': {} };
      if (method === 'wallet_sendCalls') return { id: 'bundle-1' };
      return r.bundle;
    },
  };
  const value = {
    lang: 'en',
    env: { docsPath: null },
    sdk,
    wallet: { account: A, chainId: 196, option: { provider } },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  return (
    <AppContext.Provider value={value}>
      <SignPage sdk={sdk} />
    </AppContext.Provider>
  );
}

describe('SignPage state', () => {
  it('forgets the outcome of one link when another link is opened', async () => {
    location.hash = '#/sign?p=A';
    render(rig());
    fireEvent.click(await screen.findByTestId('sign-send'));
    await screen.findByTestId('sign-done');
    location.hash = '#/sign?p=B';
    window.dispatchEvent(new Event('hashchange'));
    await screen.findByTestId('sign-send');
    expect(screen.queryByTestId('sign-done')).toBeNull();
  });

  const bundle = (status: number) => ({ status, receipts: [] });

  it.each([600, 777])('offers no second signature after a bundle with status %i', async (status) => {
    render(rig({ bundle: bundle(status) }));
    fireEvent.click(await screen.findByTestId('sign-send'));
    await screen.findByTestId('sign-bundle-id');
    expect(screen.getByTestId('sign-bundle-id').textContent).toContain('bundle-1');
    expect(screen.queryByTestId('sign-send')).toBeNull();
  });

  it.each([400, 500])('offers another try after a bundle with status %i', async (status) => {
    render(rig({ bundle: bundle(status) }));
    fireEvent.click(await screen.findByTestId('sign-send'));
    await screen.findByTestId('sign-bundle-failed');
    expect(screen.getByTestId('sign-send')).toBeTruthy();
  });

  it('resumes a partly failed send with only the remaining steps and shows the confirmed hashes', async () => {
    const seen: number[] = [];
    let attempt = 0;
    const send = async (plan: { steps: unknown[] }, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      seen.push(plan.steps.length);
      attempt++;
      if (attempt === 1) {
        o.onStep?.({ index: 0, phase: 'confirmed', hash: H1 });
        throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
      }
      return { vault: V, steps: [] };
    };
    const inspected: SignPayload[] = [];
    render(rig({ steps: 2, send, inspected }));
    fireEvent.click(await screen.findByTestId('sign-send'));
    await waitFor(() => expect(screen.getByTestId('sign-confirmed').textContent).toContain(H1));
    expect(screen.getByTestId('sign-send').textContent).toBe('Resume from step 2');
    fireEvent.click(screen.getByTestId('sign-send'));
    await screen.findByTestId('sign-done');
    expect(seen).toEqual([2, 1]);
    expect(inspected.at(-1)?.steps).toHaveLength(1);
    expect(screen.getByTestId('sign-done').textContent).not.toContain('Resume');
  });

  it('points to the vault page when the remaining steps are refused', async () => {
    const send = async (_p: unknown, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      o.onStep?.({ index: 0, phase: 'confirmed', hash: H1 });
      throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
    };
    render(rig({ steps: 2, send, refuseSlice: true }));
    fireEvent.click(await screen.findByTestId('sign-send'));
    await waitFor(() => expect(screen.getByTestId('sign-send').textContent).toBe('Resume from step 2'));
    fireEvent.click(screen.getByTestId('sign-send'));
    await screen.findByTestId('sign-resume-blocked');
    expect(screen.queryByTestId('sign-send')).toBeNull();
    expect(screen.getByTestId('sign-confirmed').textContent).toContain(H1);
  });
});

const T: Address = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';
const OTHER: Address = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const CHECK_IN = '0x183ff085' as const;
const vote = (target: Address) => encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [target] });

/** A link whose payload votes for `target` (after a check-in when `withCheckIn`), as inspect would see it. */
function votePage(target: Address, o: { withCheckIn?: boolean } = {}) {
  const raws = [
    ...(o.withCheckIn ? [{ to: V, data: CHECK_IN, value: 0n }] : []),
    { to: V, data: vote(target), value: 0n },
  ];
  const steps = raws.map((r, index) =>
    r.data === CHECK_IN
      ? step({ index })
      : step({ index, action: 'voteRecovery', summary: `Vote for ${target}.`, warnings: [GUARDIAN_WARNING] }),
  );
  const sent: unknown[] = [];
  const sdk = {
    atro: {
      chain: { id: 196 },
      handoff: {
        parse: () => ({ chainId: 196, from: A, steps: raws }),
        inspect: async () => ({ ok: true, chainId: 196, from: A, vault: V, steps }),
      },
      send: async (plan: unknown) => {
        sent.push(plan);
        return { vault: V, steps: [] };
      },
    },
    deployment: { explorerUrl: null },
  } as unknown as Sdk;
  const provider = {
    request: async () => {
      throw Object.assign(new Error('no'), { code: 4200 });
    },
  };
  const value = {
    lang: 'en',
    env: { docsPath: null },
    sdk,
    wallet: { account: A, chainId: 196, option: { provider } },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  return {
    sent,
    node: (
      <AppContext.Provider value={value}>
        <SignPage sdk={sdk} />
      </AppContext.Provider>
    ),
  };
}

const sendButton = () => screen.getByTestId('sign-send') as HTMLButtonElement;
const typeTarget = (index: number, v: string) =>
  fireEvent.input(screen.getByTestId(`sign-vote-target-${index}`), { target: { value: v } });

describe('SignPage guardian vote (spec §16.3)', () => {
  it('keeps Sign off until the guardian types the wallet the link votes for', async () => {
    location.hash = `#/sign?p=x&target=${T}`;
    const { node, sent } = votePage(T);
    render(node);
    await screen.findByTestId('sign-vote-target-0');
    // Nothing is filled in from the link.
    expect((screen.getByTestId('sign-vote-target-0') as HTMLInputElement).value).toBe('');
    expect(sendButton().disabled).toBe(true);

    typeTarget(0, OTHER);
    expect(screen.getByTestId('sign-vote-target-0-error').getAttribute('data-reason')).toBe('mismatch');
    expect(sendButton().disabled).toBe(true);
    // A mixed-case address with a broken checksum is a typo, not the same wallet.
    typeTarget(0, `${T.slice(0, 10)}${T.slice(10, 20).toUpperCase()}${T.slice(20)}`);
    expect(screen.getByTestId('sign-vote-target-0-error').getAttribute('data-reason')).toBe('invalid');
    expect(sendButton().disabled).toBe(true);

    typeTarget(0, T.toLowerCase());
    expect(screen.queryByTestId('sign-vote-target-0-error')).toBeNull();
    expect(sendButton().disabled).toBe(false);
    fireEvent.click(sendButton());
    await screen.findByTestId('sign-done');
    expect(sent).toHaveLength(1);
  });

  it('asks only for the vote step of a mixed request', async () => {
    render(votePage(T, { withCheckIn: true }).node);
    await screen.findByTestId('sign-vote-target-1');
    expect(screen.queryByTestId('sign-vote-target-0')).toBeNull();
    expect(sendButton().disabled).toBe(true);
    typeTarget(1, T);
    expect(sendButton().disabled).toBe(false);
  });

  it('asks nothing for a withdrawal, which names no wallet', async () => {
    render(votePage('0x0000000000000000000000000000000000000000').node);
    await screen.findByTestId('sign-send');
    expect(screen.queryByTestId('sign-vote-target-0')).toBeNull();
    expect(sendButton().disabled).toBe(false);
  });

  it('gives a guardian step a neutral badge, not the green Allowed', async () => {
    render(votePage(T, { withCheckIn: true }).node);
    await screen.findByTestId('sign-step-1');
    const badge = (i: number) => screen.getByTestId(`sign-step-${i}`).querySelector('.badge') as HTMLElement;
    expect(badge(0).className).toBe('badge badge-ok');
    expect(badge(0).textContent).toBe('Allowed');
    expect(badge(1).className).toBe('badge');
    expect(badge(1).textContent).toBe('Check before you sign');
  });
});

describe('SignPage sends exactly the decoded payload', () => {
  const payload: SignPayload = {
    chainId: 196,
    from: A,
    steps: [
      { to: V, data: CHECK_IN, value: 0n },
      { to: A, data: '0x18178358aa', value: 0n },
    ],
  };
  type SentPlan = { steps: { to: string; data: string; value: bigint }[] };

  function sendRig(batch: boolean) {
    const sent: { plan?: SentPlan; calls?: unknown } = {};
    const sdk = {
      atro: {
        chain: { id: 196 },
        handoff: {
          parse: () => payload,
          inspect: async (p: SignPayload) => ({
            ok: true,
            chainId: 196,
            from: A,
            vault: V,
            steps: p.steps.map((s, index) => step({ index, to: s.to })),
          }),
          calls: (p: SignPayload) => sendCallsParams(p),
        },
        send: async (plan: SentPlan) => {
          sent.plan = plan;
          return { vault: V, steps: [] };
        },
      },
      deployment: { explorerUrl: null },
    } as unknown as Sdk;
    const provider = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (!batch) throw Object.assign(new Error('no'), { code: 4200 });
        if (method === 'wallet_getCapabilities') return { '0xc4': {} };
        if (method === 'wallet_sendCalls') {
          sent.calls = (params?.[0] as { calls: unknown }).calls;
          return { id: 'bundle-1' };
        }
        return { status: 200, receipts: [] };
      },
    };
    const value = {
      lang: 'en',
      env: { docsPath: null },
      sdk,
      wallet: { account: A, chainId: 196, option: { provider } },
      walletClient: () => ({}),
    } as unknown as NonNullable<ContextType<typeof AppContext>>;
    render(
      <AppContext.Provider value={value}>
        <SignPage sdk={sdk} />
      </AppContext.Provider>,
    );
    return sent;
  }

  it('one by one: the plan sent holds the payload steps, byte for byte', async () => {
    const sent = sendRig(false);
    fireEvent.click(await screen.findByTestId('sign-send'));
    await screen.findByTestId('sign-done');
    expect(sent.calls).toBeUndefined();
    expect(sent.plan?.steps.map((s) => ({ to: s.to, data: s.data, value: s.value }))).toEqual(payload.steps);
  });

  it('EIP-5792: wallet_sendCalls carries the payload steps, byte for byte', async () => {
    const sent = sendRig(true);
    fireEvent.click(await screen.findByTestId('sign-send'));
    await screen.findByTestId('sign-done');
    expect(sent.plan).toBeUndefined();
    expect(sent.calls).toEqual(payload.steps.map((s) => ({ to: s.to, data: s.data, value: '0x0' })));
  });
});
