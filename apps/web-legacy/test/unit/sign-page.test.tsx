// @vitest-environment happy-dom
import {
  type AddressConfirmation,
  AtropyleError,
  type ConfirmAddress,
  type CreateTerms,
  exitTimes,
  GUARDIAN_WARNING,
  type InspectedStep,
  type InspectOptions,
  PRESETS,
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
    create: null,
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
    confirm: null,
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

  it('asks before the page unloads while a one-by-one send has steps left', async () => {
    const leaving = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    let attempt = 0;
    const send = async (_plan: { steps: unknown[] }, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      attempt++;
      if (attempt === 1) {
        o.onStep?.({ index: 0, phase: 'confirmed', hash: H1 });
        throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
      }
      return { vault: V, steps: [] };
    };
    render(rig({ steps: 2, send }));
    fireEvent.click(await screen.findByTestId('sign-send'));
    await waitFor(() => expect(screen.getByTestId('sign-send').textContent).toBe('Resume from step 2'));
    await waitFor(() => expect(leaving()).toBe(true));
    fireEvent.click(screen.getByTestId('sign-send'));
    await screen.findByTestId('sign-done');
    await waitFor(() => expect(leaving()).toBe(false));
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
          sent.calls = (params as [{ calls: unknown }])[0].calls;
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

// A Drill link that creates a vault and approves a token: the shape a phishing link would take.
const DRILL: Address = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const TOKEN: Address = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720';
const HEIR_A: Address = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f';
const HEIR_B: Address = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const GUARD: Address = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const READ_AT = 1_800_000_000n;

const terms: CreateTerms = {
  vault: DRILL,
  drill: true,
  heirs: [
    { account: HEIR_A, bps: 7000 },
    { account: HEIR_B, bps: 3000 },
  ],
  guardians: [GUARD],
  k: 1,
  recoveryEnabled: true,
  timing: PRESETS.drill,
  exit: exitTimes({ drill: true, guardians: [GUARD], k: 1, recoveryEnabled: true, timing: PRESETS.drill }),
  readAt: READ_AT,
  earliestAt: READ_AT + 120n,
};

const toType: ConfirmAddress[] = [
  { step: 0, vault: DRILL, role: 'heir', index: 0, account: HEIR_A, bps: 7000 },
  { step: 0, vault: DRILL, role: 'heir', index: 1, account: HEIR_B, bps: 3000 },
  { step: 0, vault: DRILL, role: 'guardian', index: 0, account: GUARD, bps: null },
];

function drillPage(
  lang: 'en' | 'vi' = 'en',
  reason: AddressConfirmation['reason'] = 'DRILL_WITH_ALLOWANCE',
  drill: { skipped?: boolean } = {},
) {
  const options: (InspectOptions | undefined)[] = [];
  const sent: unknown[] = [];
  const sdk = {
    atro: {
      chain: { id: 196 },
      handoff: {
        parse: () => ({
          chainId: 196,
          from: A,
          steps: [
            { to: V, data: '0x01', value: 0n },
            { to: TOKEN, data: '0x02', value: 0n },
          ],
        }),
        inspect: async (_p: SignPayload, o?: InspectOptions) => {
          options.push(o);
          const typed = o?.confirmed ?? [];
          const confirmed = toType.every((a, i) => typed[i]?.trim().toLowerCase() === a.account.toLowerCase());
          return {
            ok: confirmed && !drill.skipped,
            chainId: 196,
            from: A,
            vault: DRILL,
            steps: [
              step({ index: 0, action: 'createVault', summary: 'Create a Drill vault.', create: terms }),
              step({
                index: 1,
                to: TOKEN,
                action: 'approve',
                summary: 'Approve the vault.',
                ...(drill.skipped
                  ? { simulation: { ok: 'skipped', reason: 'DEPENDS_ON_PREVIOUS_STEP' } as const }
                  : {}),
              }),
            ],
            confirm: { reason, addresses: toType, confirmed },
          } satisfies SignRequestCheck;
        },
      },
      send: async (plan: unknown) => {
        sent.push(plan);
        return { vault: DRILL, steps: [] };
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
    lang,
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
  return { options, sent };
}

const retype = (i: number, v: string) =>
  fireEvent.input(screen.getByTestId(`sign-confirm-${i}`), { target: { value: v } });

describe('SignPage createVault terms', () => {
  it('states the earliest time the assets can leave, every route, the heirs with shares and the guardians with k', async () => {
    drillPage();
    const card = await screen.findByTestId('sign-terms-0');
    const earliest = screen.getByTestId('sign-terms-0-earliest');
    expect(earliest.textContent).toBe(
      'Earliest time the assets can leave your wallet: 2m after the vault is created, so not before 2027-01-15 08:02 UTC.',
    );
    expect(earliest.getAttribute('data-route')).toBe('recovery');
    const routes = [...screen.getByTestId('sign-terms-0-routes').querySelectorAll('li')];
    expect(routes.map((li) => [li.getAttribute('data-route'), li.getAttribute('data-after')])).toEqual([
      ['recovery', '120'],
      ['heirs', '240'],
      ['heirsFallback', '900'],
    ]);
    expect(routes[0].textContent).toContain('To any wallet the guardians choose: 2m after 1 of them vote');
    expect(card.textContent).toContain(
      'This is a Drill: it releases within minutes and expires 7d after it is created.',
    );
    const heirs = screen.getByTestId('sign-terms-0-heirs').textContent ?? '';
    expect(heirs).toContain(`${HEIR_A} 70%`);
    expect(heirs).toContain(`${HEIR_B} 30%`);
    const guardians = screen.getByTestId('sign-terms-0-guardians').textContent ?? '';
    expect(guardians).toContain(GUARD);
    expect(guardians).toContain('1 of 1 must confirm. Wallet recovery is on.');
    expect(card.textContent).toContain('Check in every 1m. Alarm after 2 missed check-ins, then 2m to cancel it.');
    // Only the createVault step has a terms card.
    expect(screen.queryByTestId('sign-terms-1')).toBeNull();
  });
});

describe('SignPage Drill retype gate', () => {
  const sendButton = () => screen.getByTestId('sign-send') as HTMLButtonElement;

  it('keeps Sign off until every heir and guardian is typed again, then sends what was typed', async () => {
    const { options, sent } = drillPage();
    const gate = await screen.findByTestId('sign-confirm');
    // Nothing is filled in from the link, and the labels name the role, never the address.
    for (const i of [0, 1, 2]) expect((screen.getByTestId(`sign-confirm-${i}`) as HTMLInputElement).value).toBe('');
    expect(gate.querySelector('label')?.textContent).not.toContain(HEIR_A);
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByTestId('sign-confirm-count').textContent).toBe('0 of 3 addresses match.');

    retype(0, HEIR_A);
    retype(1, HEIR_B.toLowerCase());
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByTestId('sign-confirm-count').textContent).toBe('2 of 3 addresses match.');
    retype(2, ` ${GUARD} `);
    expect(sendButton().disabled).toBe(false);
    expect(screen.getByTestId('sign-confirm-count').textContent).toBe('3 of 3 addresses match.');

    fireEvent.click(sendButton());
    await screen.findByTestId('sign-done');
    expect(sent).toHaveLength(1);
    // The first inspect shows the page; the one right before signing carries the typed addresses, in order.
    expect(options.at(-1)).toEqual({ confirmed: [HEIR_A, HEIR_B.toLowerCase(), ` ${GUARD} `] });
  });

  it('says which typed address is wrong or invalid, for a screen reader too', async () => {
    drillPage();
    await screen.findByTestId('sign-confirm');
    const input = screen.getByLabelText(/^Heir 1 \(70%\) of the vault in step 1/) as HTMLInputElement;
    expect(input).toBe(screen.getByTestId('sign-confirm-0'));
    expect(input.getAttribute('aria-invalid')).toBeNull();

    retype(0, HEIR_B);
    const error = screen.getByTestId('sign-confirm-0-error');
    expect(error.getAttribute('data-reason')).toBe('mismatch');
    expect(error.textContent).toBe('This is not the address in this link. Do not sign if you do not know whose it is.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);

    // A mixed-case address with a broken checksum is a typo, not the same wallet.
    retype(0, `${HEIR_A.slice(0, 12)}${HEIR_A.slice(12, 20).toUpperCase()}${HEIR_A.slice(20)}`);
    expect(screen.getByTestId('sign-confirm-0-error').getAttribute('data-reason')).toBe('invalid');
    expect(sendButton().disabled).toBe(true);

    retype(0, HEIR_A);
    expect(screen.queryByTestId('sign-confirm-0-error')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByTestId('sign-confirm-count').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByLabelText(/^Guardian 1 of the vault in step 1/)).toBe(screen.getByTestId('sign-confirm-2'));
  });

  it('speaks Vietnamese', async () => {
    drillPage('vi');
    const gate = await screen.findByTestId('sign-confirm');
    expect(gate.querySelector('h2')?.textContent).toBe('Gõ lại các địa chỉ trước khi ký');
    expect(screen.getByLabelText(/^Người thừa kế 2 \(30%\) của vault ở bước 1/)).toBe(
      screen.getByTestId('sign-confirm-1'),
    );
    retype(1, HEIR_A);
    expect(screen.getByTestId('sign-confirm-1-error').textContent).toBe(
      'Đây không phải địa chỉ trong link này. Đừng ký nếu bạn không biết địa chỉ này của ai.',
    );
    expect(screen.getByTestId('sign-confirm-count').textContent).toBe('0 trên 3 địa chỉ đã khớp.');
    expect(screen.getByTestId('sign-terms-0-earliest').textContent).toContain('2m sau khi vault được tạo');
  });

  it('says why when the link gives a Drill new heirs or recovery guardians, in English and Vietnamese', async () => {
    drillPage('en', 'DRILL_RECIPIENTS_CHANGED');
    const gate = await screen.findByTestId('sign-confirm');
    expect(gate.getAttribute('aria-describedby')).toBe('sign-confirm-intro');
    expect(screen.getByTestId('sign-confirm').querySelector('#sign-confirm-intro')?.textContent).toMatch(
      /^This link changes who can receive the assets of a Drill vault\. A Drill releases within minutes and can use every allowance you already gave it/,
    );
    expect(sendButton().disabled).toBe(true);
    cleanup();
    drillPage('vi', 'DRILL_RECIPIENTS_CHANGED');
    await screen.findByTestId('sign-confirm');
    expect(screen.getByTestId('sign-confirm').querySelector('#sign-confirm-intro')?.textContent).toMatch(
      /^Link này đổi người có thể nhận tài sản của một vault Drill\./,
    );
  });

  it('asks for no address and offers no Sign when the network could not simulate every step in order', async () => {
    drillPage('en', 'DRILL_WITH_ALLOWANCE', { skipped: true });
    const banner = await screen.findByTestId('sign-unproven');
    expect(banner.textContent).toMatch(/^The network could not simulate each step after the ones before it/);
    expect(screen.queryByTestId('sign-confirm')).toBeNull();
    expect(screen.queryByTestId('sign-send')).toBeNull();
    // The terms of the vault are still stated.
    expect(screen.getByTestId('sign-terms-0')).toBeTruthy();
    cleanup();
    drillPage('vi', 'DRILL_WITH_ALLOWANCE', { skipped: true });
    expect((await screen.findByTestId('sign-unproven')).textContent).toMatch(
      /^Mạng không mô phỏng được từng bước sau các bước trước nó/,
    );
  });
});
