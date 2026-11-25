import {
  type AddressConfirmation,
  AtropyleError,
  type ConfirmAddress,
  type CreateTerms,
  exitTimes,
  factoryAbi,
  GUARDIAN_WARNING,
  type InspectedStep,
  type InspectOptions,
  PRESETS,
  paramsToAbi,
  type SignPayload,
  type SignRequestCheck,
  sendCallsParams,
  type TxPlan,
  vaultAbi,
} from '@atropyle/sdk';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { type Address, encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignPage } from '../../src/app/sign/sign-page';
import type { Eip1193 } from '../../src/wallet/impl/wallet';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import { renderWithProviders } from '../helpers/render';
import { walletValue } from '../helpers/wallet';
import { PEOPLE } from './fixtures';

const fake = vi.hoisted(() => ({
  parse: vi.fn(),
  inspect: vi.fn(),
  send: vi.fn(),
  calls: vi.fn(),
  receipt: vi.fn(),
  block: vi.fn(),
  framed: { value: false },
}));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const factory = '0x1111111111111111111111111111111111111111';
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: () => ({
      deployment: { explorerUrl: null, factory, feeTokens: [] },
      atro: {
        chain: { id: 196 },
        deployment: { factory, feeTokens: [] },
        send: fake.send,
        handoff: { parse: fake.parse, inspect: fake.inspect, calls: fake.calls },
        publicClient: {
          waitForTransactionReceipt: fake.receipt,
          getTransactionReceipt: fake.receipt,
          getBlock: fake.block,
        },
      },
      rpc: { read: [], verify: [] },
    }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});
vi.mock('../../src/lib/framed', () => ({ isFramed: () => fake.framed.value }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/sign/',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

const A = PEOPLE.owner;
const V = PEOPLE.vault;
const T = PEOPLE.g2;
const OTHER = PEOPLE.stranger;
const FACTORY: Address = '0x1111111111111111111111111111111111111111';
const H1 = `0x${'11'.repeat(32)}` as Hex;
const CHECK_IN: Hex = '0x183ff085';
const POKE: Hex = '0x18178358';
const vote = (target: Address) => encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [target] });

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
function checkOf(steps: InspectedStep[], over: Partial<SignRequestCheck> = {}): SignRequestCheck {
  return {
    ok: steps.every((s) => s.allowed && s.simulation.ok !== false),
    chainId: 196,
    from: A,
    vault: V,
    steps,
    confirm: null,
    ...over,
  };
}
const payloadOf = (steps: { to: Address; data: Hex }[]): SignPayload => ({
  chainId: 196,
  from: A,
  steps: steps.map((s) => ({ ...s, value: 0n })),
});

/** The fake parse returns `payload`; the fake inspect answers every call with `check`, or computes it. */
function link(
  payload: SignPayload,
  check: SignRequestCheck | ((p: SignPayload, o?: InspectOptions) => SignRequestCheck),
) {
  fake.parse.mockReturnValue(payload);
  fake.inspect.mockImplementation(async (p: SignPayload, o?: InspectOptions) =>
    typeof check === 'function' ? check(p, o) : check,
  );
}

/** atro.send one step at a time: every step confirmed with H1. */
async function sendAll(p: TxPlan, _w: unknown, o: { onStep?: (e: unknown) => void }) {
  for (const [index, s] of p.steps.entries())
    o.onStep?.({ index, total: p.steps.length, step: s, phase: 'confirmed', hash: H1 });
  return { vault: V, steps: [] };
}
const ok = (hash: Hex) => ({
  transactionHash: hash,
  from: A,
  to: V,
  status: 'success',
  blockNumber: 5n,
  gasUsed: 1n,
  logs: [],
});

/** An EIP-5792 wallet on chain 196 that records the calls of wallet_sendCalls. */
function bundleWallet() {
  const sent: { calls?: unknown } = {};
  const provider: Eip1193 = {
    async request({ method, params }) {
      if (method === 'wallet_getCapabilities') return { '0xc4': { atomic: { status: 'supported' } } };
      if (method === 'wallet_sendCalls') {
        sent.calls = (params as [{ calls: unknown }])[0].calls;
        return { id: 'bundle-1' };
      }
      if (method === 'wallet_getCallsStatus') return { status: 200, receipts: [{ transactionHash: H1 }] };
      throw Object.assign(new Error(`unexpected ${method}`), { code: 4200 });
    },
  };
  return { provider, sent };
}

function show(o: { lang?: 'en' | 'vi'; provider?: Eip1193 } = {}) {
  const base = walletValue();
  const value: WalletValue =
    o.provider && base.wallet
      ? walletValue({ wallet: { ...base.wallet, option: { ...base.wallet.option, provider: o.provider } } })
      : base;
  return renderWithProviders(
    <WalletContext value={value}>
      <SignPage />
    </WalletContext>,
    { lang: o.lang },
  );
}

const sendButton = () => screen.getByTestId('sign-tx-send') as HTMLButtonElement;
const ready = () => waitFor(() => expect(sendButton().disabled).toBe(false));
/** The card's heading, which becomes the Receipt's once the plan is done (its check icon has no text). */
const txHeading = () => screen.getByTestId('sign-tx').querySelector('h3')?.textContent;
const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

beforeEach(() => {
  vi.resetAllMocks();
  fake.framed.value = false;
  fake.receipt.mockImplementation(async ({ hash }: { hash: Hex }) => ok(hash));
  fake.block.mockResolvedValue({ timestamp: 1_800_000_000n });
  fake.send.mockImplementation(sendAll);
  fake.calls.mockImplementation((p: SignPayload) => sendCallsParams(p));
  window.history.replaceState(null, '', '/sign/#p=x');
});
afterEach(() => window.history.replaceState(null, '', '/'));

describe('SignPage: what the link asks', () => {
  it('shows LINK_INVALID for a link that does not parse, and inspects nothing', async () => {
    fake.parse.mockImplementation(() => {
      throw new AtropyleError('LINK_INVALID', { message: 'The signing link is not valid.' });
    });
    show();
    const box = await screen.findByTestId('sign-invalid');
    // ErrorBox shows its test id once the decoder chunk has loaded: find it, do not get it.
    const error = await within(box).findByTestId('error');
    expect(error.getAttribute('data-code')).toBe('LINK_INVALID');
    expect(fake.inspect).not.toHaveBeenCalled();
  });

  it('shows no request inside a frame of another page', async () => {
    fake.framed.value = true;
    link(payloadOf([{ to: V, data: CHECK_IN }]), checkOf([step()]));
    show();
    expect(await screen.findByTestId('sign-framed')).toBeTruthy();
    expect(fake.parse).not.toHaveBeenCalled();
    expect(fake.inspect).not.toHaveBeenCalled();
  });

  it('lists a refused request with its reason, and offers neither the card nor a wallet mirror', async () => {
    const bad = step({
      to: OTHER,
      action: null,
      summary: null,
      allowed: false,
      reason: 'unknown call',
      simulation: { ok: 'skipped', reason: 'NOT_ALLOWED' },
    });
    link(payloadOf([{ to: OTHER, data: '0xdeadbeef' }]), checkOf([bad]));
    show();
    expect(await screen.findByTestId('sign-refused')).toBeTruthy();
    const row = screen.getByTestId('sign-step-0');
    expect(row.getAttribute('data-allowed')).toBe('false');
    expect(row.textContent).toContain('unknown call');
    expect(row.textContent).toContain('A call this page does not recognise');
    expect(screen.getByTestId('sign-check-decoded').getAttribute('data-state')).toBe('fail');
    expect(screen.getByTestId('sign-check-whitelist').getAttribute('data-state')).toBe('fail');
    expect(screen.getByTestId('sign-check-simulation').getAttribute('data-state')).toBe('unknown');
    expect(screen.queryByTestId('sign-tx')).toBeNull();
    expect(document.querySelector('[data-testid*="-mirror-"]')).toBeNull();
  });

  it('says why nothing can be signed when a step would fail, and shows the error', async () => {
    const failing = step({ simulation: { ok: false, error: new AtropyleError('NOT_OWNER').toJSON() } });
    link(payloadOf([{ to: V, data: CHECK_IN }]), checkOf([failing]));
    show();
    expect(await screen.findByTestId('sign-sim-failed')).toBeTruthy();
    // No TxCard here loads the decoder: ErrorBox loads it itself, so its test id comes a tick later.
    expect((await screen.findByTestId('sign-sim-error')).getAttribute('data-code')).toBe('NOT_OWNER');
    expect(screen.getByTestId('sign-check-simulation').getAttribute('data-state')).toBe('fail');
    expect(screen.queryByTestId('sign-tx')).toBeNull();
  });

  it('states the guardian warning once, in its own banner', async () => {
    link(
      payloadOf([{ to: V, data: vote(T) }]),
      checkOf([step({ action: 'voteRecovery', warnings: [GUARDIAN_WARNING] })]),
    );
    show();
    expect(await screen.findByTestId('sign-guardian')).toBeTruthy();
    await screen.findByTestId('sign-tx');
    expect(screen.queryByTestId(`warning-${GUARDIAN_WARNING.code}`)).toBeNull();
  });
});

describe('SignPage sends exactly the decoded payload', () => {
  it('one by one: the plan sent holds the payload steps, byte for byte', async () => {
    const payload = payloadOf([
      { to: V, data: CHECK_IN },
      { to: V, data: POKE },
    ]);
    link(payload, (p) =>
      checkOf(p.steps.map((s, index) => step({ index, to: s.to, action: index === 0 ? 'checkIn' : 'poke' }))),
    );
    show();
    await ready();
    expect(txHeading()).toBe('Steps to sign');
    fireEvent.click(sendButton());
    await screen.findByTestId('sign-tx-done');
    // The Receipt says what happened: the page's title for the steps gives way to TxCard's done title.
    expect(txHeading()).toBe('Signed and recorded');
    const plan = fake.send.mock.calls[0]?.[0] as TxPlan;
    expect(plan.steps.map((s) => ({ to: s.to, data: s.data, value: s.value }))).toEqual(payload.steps);
    expect(fake.inspect.mock.calls.at(-1)?.[0]).toEqual(payload);
  });

  it('EIP-5792: wallet_sendCalls carries the payload steps, byte for byte', async () => {
    const payload = payloadOf([{ to: V, data: CHECK_IN }]);
    link(payload, checkOf([step()]));
    const w = bundleWallet();
    show({ provider: w.provider });
    await ready();
    fireEvent.click(sendButton());
    await screen.findByTestId('sign-tx-done');
    expect(fake.send).not.toHaveBeenCalled();
    expect(w.sent.calls).toEqual(payload.steps.map((s) => ({ to: s.to, data: s.data, value: '0x0' })));
    expect(screen.getByTestId('sign-open-vault').getAttribute('href')).toBe(`/vault/#${V}`);
  });

  it('names the Receipt in Vietnamese too', async () => {
    link(payloadOf([{ to: V, data: CHECK_IN }]), checkOf([step()]));
    show({ lang: 'vi' });
    await ready();
    expect(txHeading()).toBe('Các bước cần ký');
    fireEvent.click(sendButton());
    await screen.findByTestId('sign-tx-done');
    expect(txHeading()).toBe('Đã ký và ghi lên chain');
  });

  it('names an NFT a new vault lists by the kind in its calldata, not as a call it cannot read', async () => {
    const create = encodeFunctionData({
      abi: factoryAbi,
      functionName: 'createVault',
      args: [
        paramsToAbi({
          heirs: [{ account: PEOPLE.heirA, bps: 10_000 }],
          guardians: [],
          k: 0,
          recoveryEnabled: false,
          timing: PRESETS.sixMonths,
          assets: [{ kind: 'erc721', token: PEOPLE.nft, id: 2n, heir: 0 }],
        }),
        `0x${'00'.repeat(32)}`,
        false,
        PEOPLE.token,
      ],
    });
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [V, 2n] });
    link(
      payloadOf([
        { to: FACTORY, data: create },
        { to: PEOPLE.nft, data: approve },
      ]),
      checkOf([
        step({ to: FACTORY, action: 'createVault', summary: 'Create a vault.', create: realTerms }),
        step({ index: 1, to: PEOPLE.nft, action: 'approve', summary: 'Allow the vault.' }),
      ]),
    );
    show({ provider: bundleWallet().provider });
    await screen.findByTestId('sign-tx-mirror-bundle');
    expect(screen.getByTestId('sign-tx-mirror-1').textContent).toContain('NFT #2');
    expect(screen.queryByTestId('sign-tx-mirror-1-danger-unknownCall')).toBeNull();
  });
});

const realTerms: CreateTerms = {
  vault: V,
  drill: false,
  heirs: [{ account: PEOPLE.heirA, bps: 10_000 }],
  guardians: [],
  k: 0,
  recoveryEnabled: false,
  timing: PRESETS.sixMonths,
  exit: exitTimes({ drill: false, guardians: [], k: 0, recoveryEnabled: false, timing: PRESETS.sixMonths }),
  readAt: 1_800_000_000n,
  earliestAt: null,
};

describe('SignPage guardian vote (spec §16.3)', () => {
  const votePage = (target: Address, o: { withCheckIn?: boolean } = {}) => {
    const raws = [...(o.withCheckIn ? [{ to: V, data: CHECK_IN }] : []), { to: V, data: vote(target) }];
    link(
      payloadOf(raws),
      checkOf(
        raws.map((r, index) =>
          r.data === CHECK_IN
            ? step({ index })
            : step({ index, action: 'voteRecovery', summary: 'Vote.', warnings: [GUARDIAN_WARNING] }),
        ),
      ),
    );
    show();
  };

  it('keeps Sign off until the guardian types the wallet the link votes for', async () => {
    window.history.replaceState(null, '', `/sign/#p=x&target=${T}`);
    votePage(T);
    const field = (await screen.findByTestId('sign-vote-target-0')) as HTMLInputElement;
    // Nothing is filled in from the link.
    expect(field.value).toBe('');
    expect(sendButton().disabled).toBe(true);

    type('sign-vote-target-0', OTHER);
    expect(screen.getByTestId('sign-vote-target-0-error').getAttribute('data-reason')).toBe('mismatch');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('sign-votes-live').textContent).toBe(
      'This is not the wallet this link votes for. Do not sign, and ask the owner again.',
    );
    // A mixed-case address with a broken checksum is a typo, not the same wallet. The first letter of T in the other
    // case: upper-casing a run of T could give T itself back (its checksum already has those letters upper case).
    const typo = T.replace('0x15d3', '0x15D3');
    expect(typo).not.toBe(T);
    type('sign-vote-target-0', typo);
    expect(screen.getByTestId('sign-vote-target-0-error').getAttribute('data-reason')).toBe('invalid');
    expect(sendButton().disabled).toBe(true);
    // Still being typed: no error yet.
    type('sign-vote-target-0', T.slice(0, 20));
    expect(screen.queryByTestId('sign-vote-target-0-error')).toBeNull();

    type('sign-vote-target-0', T.toLowerCase());
    expect(screen.queryByTestId('sign-vote-target-0-error')).toBeNull();
    expect(screen.getByTestId('sign-votes-live').textContent).toBe('It matches the wallet this link votes for.');
    await ready();
    fireEvent.click(sendButton());
    await screen.findByTestId('sign-tx-done');
    expect(fake.send).toHaveBeenCalledTimes(1);
  });

  it('asks only for the vote step of a mixed request', async () => {
    votePage(T, { withCheckIn: true });
    await screen.findByTestId('sign-vote-target-1');
    expect(screen.queryByTestId('sign-vote-target-0')).toBeNull();
    expect(sendButton().disabled).toBe(true);
    type('sign-vote-target-1', T);
    await ready();
  });

  it('asks nothing for a withdrawal, which names no wallet', async () => {
    votePage('0x0000000000000000000000000000000000000000');
    await ready();
    expect(screen.queryByTestId('sign-vote-target-0')).toBeNull();
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
  link(
    payloadOf([
      { to: V, data: '0x01' },
      { to: TOKEN, data: '0x02' },
    ]),
    (_p, o) => {
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
            ...(drill.skipped ? { simulation: { ok: 'skipped', reason: 'DEPENDS_ON_PREVIOUS_STEP' } as const } : {}),
          }),
        ],
        confirm: { reason, addresses: toType, confirmed },
      };
    },
  );
  fake.send.mockImplementation(async (p: TxPlan, w: unknown, o: { onStep?: (e: unknown) => void }) => {
    await sendAll(p, w, o);
    return { vault: DRILL, steps: [] };
  });
  show({ lang });
  return { options };
}

describe('SignPage createVault terms', () => {
  it('states the earliest time the assets can leave, every route, the heirs with shares and the guardians with k', async () => {
    drillPage();
    const card = await screen.findByTestId('sign-terms-0');
    expect(card.querySelector(`[data-address="${DRILL}"]`)).toBeTruthy();
    const earliest = screen.getByTestId('sign-terms-0-earliest');
    expect(earliest.textContent).toBe(
      'Earliest time the assets can leave your wallet: 2 minutes after the vault is created, so not before 2027-01-15 08:02 UTC.',
    );
    expect(earliest.getAttribute('data-route')).toBe('recovery');
    const routes = [...screen.getByTestId('sign-terms-0-routes').querySelectorAll('li')];
    expect(routes.map((li) => [li.getAttribute('data-route'), li.getAttribute('data-after')])).toEqual([
      ['recovery', '120'],
      ['heirs', '240'],
      ['heirsFallback', '900'],
    ]);
    expect(routes[0].textContent).toContain('To any wallet the guardians choose: 2 minutes after 1 of them vote');
    expect(card.textContent).toContain(
      'This is a Drill: it hands over the assets within minutes, and it expires 7 days after it is created.',
    );
    const heirs = screen.getByTestId('sign-terms-0-heirs');
    const share = (account: Address) => heirs.querySelector(`[data-address="${account}"]`)?.closest('li')?.textContent;
    expect(share(HEIR_A)).toContain('70%');
    expect(share(HEIR_B)).toContain('30%');
    const guardians = screen.getByTestId('sign-terms-0-guardians');
    expect(guardians.querySelector(`[data-address="${GUARD}"]`)).toBeTruthy();
    expect(guardians.textContent).toContain('1 of 1 must confirm. Wallet recovery is on.');
    expect(card.textContent).toContain(
      'Check in every 1 minute. Alarm after 2 missed check-ins, then 2 minutes to cancel it.',
    );
    // Only the createVault step has a terms card.
    expect(screen.queryByTestId('sign-terms-1')).toBeNull();
  });
});

describe('SignPage Drill retype gate', () => {
  it('keeps Sign off until every heir and guardian is typed again, then sends what was typed', async () => {
    const { options } = drillPage();
    const gate = await screen.findByTestId('sign-confirm');
    // Nothing is filled in from the link, and the labels name the role, never the address.
    for (const i of [0, 1, 2]) expect((screen.getByTestId(`sign-confirm-${i}`) as HTMLInputElement).value).toBe('');
    for (const label of gate.querySelectorAll('label')) expect(label.textContent).not.toContain(HEIR_A);
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByTestId('sign-confirm-count').textContent).toBe('0 of 3 addresses match.');

    type('sign-confirm-0', HEIR_A);
    type('sign-confirm-1', HEIR_B.toLowerCase());
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByTestId('sign-confirm-count').textContent).toBe('2 of 3 addresses match.');
    type('sign-confirm-2', ` ${GUARD} `);
    expect(screen.getByTestId('sign-confirm-count').textContent).toBe('3 of 3 addresses match.');
    await ready();

    fireEvent.click(sendButton());
    await screen.findByTestId('sign-tx-done');
    expect(fake.send).toHaveBeenCalledTimes(1);
    // The first inspect shows the page; the one right before signing carries the typed addresses, in order.
    expect(options.at(-1)).toEqual({ confirmed: [HEIR_A, HEIR_B.toLowerCase(), ` ${GUARD} `] });
  });

  it('says which typed address is wrong or invalid, for a screen reader too', async () => {
    drillPage();
    await screen.findByTestId('sign-confirm');
    const input = screen.getByLabelText(/^Heir 1 \(70%\) of the vault in step 1/) as HTMLInputElement;
    expect(input).toBe(screen.getByTestId('sign-confirm-0'));
    expect(input.getAttribute('aria-invalid')).toBeNull();

    type('sign-confirm-0', HEIR_B);
    const error = screen.getByTestId('sign-confirm-0-error');
    expect(error.getAttribute('data-reason')).toBe('mismatch');
    expect(error.textContent).toBe('This is not the address in this link. Do not sign if you do not know whose it is.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const errorId = error.closest('p')?.id;
    expect(errorId).toBeTruthy();
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(errorId);
    expect(screen.getByTestId('sign-confirm-live').textContent).toBe(error.textContent);

    // A mixed-case address with a broken checksum is a typo, not the same wallet.
    const typo = `${HEIR_A.slice(0, 12)}${HEIR_A.slice(12, 20).toUpperCase()}${HEIR_A.slice(20)}`;
    expect(typo).not.toBe(HEIR_A);
    type('sign-confirm-0', typo);
    expect(screen.getByTestId('sign-confirm-0-error').getAttribute('data-reason')).toBe('invalid');
    expect(sendButton().disabled).toBe(true);

    type('sign-confirm-0', HEIR_A);
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
    type('sign-confirm-1', HEIR_A);
    expect(screen.getByTestId('sign-confirm-1-error').textContent).toBe(
      'Đây không phải địa chỉ trong link này. Đừng ký nếu bạn không biết địa chỉ này của ai.',
    );
    expect(screen.getByTestId('sign-confirm-count').textContent).toBe('0 trên 3 địa chỉ đã khớp.');
    expect(screen.getByTestId('sign-terms-0-earliest').textContent).toContain('2 phút sau khi vault được tạo');
    expect(screen.getByTestId('sign-terms-0').textContent).toContain('Đây là Drill (bản diễn tập): nó trao tài sản');
  });

  it('says why when the link gives a Drill new heirs or recovery guardians, in English and Vietnamese', async () => {
    const first = drillPage('en', 'DRILL_RECIPIENTS_CHANGED');
    const gate = await screen.findByTestId('sign-confirm');
    expect(first.options.length).toBeGreaterThan(0);
    expect(gate.getAttribute('aria-describedby')).toBe('sign-confirm-intro');
    expect(gate.querySelector('#sign-confirm-intro')?.textContent).toMatch(
      /^This link changes who can receive the assets of a Drill vault\. A Drill hands over the assets within minutes and can use every allowance you already gave it/,
    );
    expect(sendButton().disabled).toBe(true);
  });

  it('says it in Vietnamese too', async () => {
    drillPage('vi', 'DRILL_RECIPIENTS_CHANGED');
    const gate = await screen.findByTestId('sign-confirm');
    expect(gate.querySelector('#sign-confirm-intro')?.textContent).toMatch(
      /^Link này đổi người có thể nhận tài sản của một vault Drill \(bản diễn tập\)\./,
    );
  });

  it('asks for no address and offers no Sign when the network could not simulate every step in order', async () => {
    drillPage('en', 'DRILL_WITH_ALLOWANCE', { skipped: true });
    const banner = await screen.findByTestId('sign-unproven');
    expect(banner.textContent).toMatch(/^The network could not simulate each step after the ones before it/);
    expect(screen.queryByTestId('sign-confirm')).toBeNull();
    expect(screen.queryByTestId('sign-tx')).toBeNull();
    expect(screen.getByTestId('sign-check-simulation').getAttribute('data-state')).toBe('fail');
    // The terms of the vault are still stated.
    expect(screen.getByTestId('sign-terms-0')).toBeTruthy();
  });
});

describe('SignPage state', () => {
  it('forgets what was typed for one link when another link is opened', async () => {
    link(payloadOf([{ to: V, data: vote(T) }]), checkOf([step({ action: 'voteRecovery' })]));
    show();
    await screen.findByTestId('sign-vote-target-0');
    type('sign-vote-target-0', T);
    expect((screen.getByTestId('sign-vote-target-0') as HTMLInputElement).value).toBe(T);
    act(() => {
      window.history.replaceState(null, '', '/sign/#p=y');
      window.dispatchEvent(new Event('hashchange'));
    });
    await waitFor(() => expect((screen.getByTestId('sign-vote-target-0') as HTMLInputElement).value).toBe(''));
  });

  it('shows the refusal when the request no longer passes at send time, and sends nothing', async () => {
    const payload = payloadOf([{ to: V, data: CHECK_IN }]);
    const refused = checkOf([step({ allowed: false, action: null, summary: null, reason: 'vault not found' })]);
    fake.parse.mockReturnValue(payload);
    fake.inspect.mockResolvedValueOnce(checkOf([step()])).mockResolvedValue(refused);
    show();
    await ready();
    fireEvent.click(sendButton());
    expect(await screen.findByTestId('sign-refused')).toBeTruthy();
    expect(screen.queryByTestId('sign-tx')).toBeNull();
    expect(screen.getByTestId('sign-step-0').textContent).toContain('vault not found');
    expect(fake.send).not.toHaveBeenCalled();
  });
});
