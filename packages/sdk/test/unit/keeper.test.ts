import { type Address, getAddress, type WalletClient } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  type AtropyleClient,
  AtropyleError,
  type KeeperAction,
  type KeeperReason,
  keeperTick,
  modelEngine,
  planKeeperActions,
  type Simulation,
  type TxPlan,
  timelineOf,
  type Warning,
} from '../../src/index';
import { DAY, HEIR_A, HEIR_B, makeSnapshot, type SnapOptions, VAULT } from './fixtures';

const engine = modelEngine();
const DRILL = { period: 60, threshold: 2, window: 120 };

function decide(o: SnapOptions, lastDistributeAt: bigint | null = null) {
  const snap = makeSnapshot(o);
  const now = snap.status.blockTimestamp;
  return planKeeperActions(snap.status, timelineOf(engine, snap, now), now, { lastDistributeAt });
}

type Case = [
  name: string,
  snap: SnapOptions,
  last: bigint | null,
  action: KeeperAction | null,
  reason: KeeperReason,
  next: bigint | null,
];

describe('planKeeperActions', () => {
  it.each<Case>([
    ['nothing due yet: wait for lateAt', {}, null, null, 'WAITING', 3n * DAY],
    ['late: raise the alarm', { now: 3n * DAY, pending: 'grace' }, null, 'poke', 'TRANSITION_DUE', 3n * DAY],
    [
      'release due with assets: one distribute releases and pays',
      { state: 'grace', pending: 'releasedInherit', alarmAt: 3n * DAY, now: 6n * DAY },
      null,
      'distribute',
      'RELEASE_DUE',
      6n * DAY,
    ],
    [
      'release due without coverage: poke',
      { state: 'grace', pending: 'releasedInherit', alarmAt: 3n * DAY, now: 6n * DAY, coverage: [0n, 0n] },
      null,
      'poke',
      'RELEASE_DUE',
      6n * DAY,
    ],
    [
      'released with coverage: distribute',
      { state: 'releasedInherit', now: 7n * DAY },
      null,
      'distribute',
      'DISTRIBUTE_DUE',
      7n * DAY + 3600n,
    ],
    [
      'released, distributed 100 s ago: back off for an hour',
      { state: 'releasedInherit', now: 7n * DAY },
      7n * DAY - 100n,
      null,
      'DISTRIBUTE_BACKOFF',
      7n * DAY + 3500n,
    ],
    [
      'released and empty: look again tomorrow',
      { state: 'releasedRecover', now: 7n * DAY, coverage: [0n, 0n] },
      null,
      null,
      'DONE',
      8n * DAY,
    ],
    [
      'expired drill: never again',
      { drill: true, expiresAt: 100n, now: 100n, pending: 'grace' },
      null,
      null,
      'EXPIRED',
      null,
    ],
    [
      'drill expiring before any transition: look at expiry',
      { k: 0, recoveryEnabled: false, timing: DRILL, drill: true, expiresAt: 50n, now: 10n },
      null,
      null,
      'WAITING',
      50n,
    ],
  ])('%s', (_name, o, last, action, reason, nextCheckAt) => {
    expect(decide(o, last)).toEqual({ vault: VAULT, action, reason, nextCheckAt });
  });

  it('never asks to look again in the past', () => {
    const d = decide({ k: 0, recoveryEnabled: false, timing: DRILL, now: 130n });
    expect(d.reason).toBe('WAITING');
    expect(d.nextCheckAt).toBe(131n);
  });
});

// keeperTick against a stand-in client: a released vault with coverage, so every tick wants one distribute.
const RELEASED = makeSnapshot({ state: 'releasedInherit', now: 7n * DAY });
const KEEPER = HEIR_A;
const ENOUGH = 10n ** 18n;

interface Fake {
  sim?: (vault: Address) => Simulation;
  snapshot?: (vault: Address) => Promise<unknown>;
  warnings?: Warning[];
  send?: (plan: TxPlan) => Promise<unknown>;
  balance?: bigint;
}

function fakeAtro(o: Fake = {}) {
  const sent: TxPlan[] = [];
  const atro = {
    publicClient: {
      getBlock: async () => ({ timestamp: 7n * DAY }),
      getBalance: async () => o.balance ?? ENOUGH,
    },
    engineFor: async () => engine,
    vault: (vault: Address) => ({
      snapshot: () => (o.snapshot ?? (async () => RELEASED))(vault),
      prepare: async (): Promise<TxPlan> => ({
        chainId: 31337,
        from: KEEPER,
        vault,
        steps: [{ simulation: o.sim?.(vault) ?? { ok: true, gas: 1n } } as TxPlan['steps'][number]],
        summary: '',
        warnings: o.warnings ?? [],
      }),
    }),
    send: async (plan: TxPlan) => {
      sent.push(plan);
      return (await o.send?.(plan)) ?? { vault: plan.vault, steps: [{ hash: `0x${'ab'.repeat(32)}` }] };
    },
  } as unknown as AtropyleClient;
  return { atro, sent };
}

const wallet = { account: { address: KEEPER } } as unknown as WalletClient;
const A = VAULT;
const B = '0x2222222222222222222222222222222222222222' as Address;
const RETRY_AT = 7n * DAY + 300n;
const rateLimited = () => new AtropyleError('RPC_RATE_LIMITED');

describe('keeperTick', () => {
  it('skips a vault whose estimate is over maxGas and retries it in RETRY_AFTER seconds', async () => {
    const { atro, sent } = fakeAtro({ sim: () => ({ ok: true, gas: 4_000_001n }) });
    const r = await keeperTick(atro, [VAULT], { wallet });
    expect(r.outcomes[0]).toMatchObject({ status: 'gas-cap', nextCheckAt: RETRY_AT });
    expect(sent).toEqual([]);
    const within = fakeAtro({ sim: () => ({ ok: true, gas: 4_000_000n }) });
    expect((await keeperTick(within.atro, [VAULT], { wallet })).outcomes[0].status).toBe('sent');
  });

  it('reports a revert as simulation-failed, not as a thrown error', async () => {
    const error = new AtropyleError('ALREADY_RELEASED').toJSON();
    const { atro } = fakeAtro({ sim: () => ({ ok: false, error }) });
    const r = await keeperTick(atro, [VAULT], { wallet });
    expect(r.outcomes[0]).toMatchObject({ status: 'simulation-failed', error, nextCheckAt: RETRY_AT });
  });

  it('keeps the vault it already sent when a later vault hits a rate limit', async () => {
    const snapshot = async (v: Address) => {
      if (v === B) throw rateLimited();
      return RELEASED;
    };
    const read = await keeperTick(fakeAtro({ snapshot }).atro, [A, B], { wallet });
    expect(read.sent).toBe(1);
    expect(read.outcomes[0]).toMatchObject({ vault: A, status: 'sent', hash: `0x${'ab'.repeat(32)}` });
    expect(read.outcomes[1]).toMatchObject({
      vault: B,
      status: 'read-failed',
      error: { code: 'RPC_RATE_LIMITED' },
      nextCheckAt: RETRY_AT,
    });
    const sim = (v: Address): Simulation => {
      if (v === B) throw rateLimited();
      return { ok: true, gas: 1n };
    };
    const prepare = await keeperTick(fakeAtro({ sim }).atro, [A, B], { wallet });
    expect(prepare.outcomes.map((x) => x.status)).toEqual(['sent', 'send-failed']);
    expect(prepare.outcomes[1]).toMatchObject({ error: { code: 'RPC_RATE_LIMITED' }, nextCheckAt: RETRY_AT });
  });

  it('records a send that fails after the broadcast as send-failed with the hash kept', async () => {
    const hash = `0x${'cd'.repeat(32)}`;
    const send = async () => {
      throw new AtropyleError('RPC_UNAVAILABLE', { details: { hash } });
    };
    const r = await keeperTick(fakeAtro({ send }).atro, [A], { wallet });
    expect(r).toMatchObject({
      sent: 0,
      outcomes: [
        { status: 'send-failed', error: { code: 'RPC_UNAVAILABLE', details: { hash } }, nextCheckAt: RETRY_AT },
      ],
    });
  });

  it('drops a vault that is not a vault or not an address, for good', async () => {
    const snapshot = async () => {
      throw new AtropyleError('NOT_VAULT');
    };
    const r = await keeperTick(fakeAtro({ snapshot }).atro, [A, 'nope' as Address], { wallet });
    expect(r.outcomes).toMatchObject([
      { vault: A, status: 'read-failed', error: { code: 'NOT_VAULT' }, nextCheckAt: null },
      { vault: 'nope', status: 'read-failed', error: { code: 'INVALID_ADDRESS' }, nextCheckAt: null },
    ]);
  });

  it('checksums outcome.vault and handles a vault listed twice once', async () => {
    const lower = HEIR_B.toLowerCase() as Address;
    const { atro, sent } = fakeAtro();
    const r = await keeperTick(atro, [lower, getAddress(HEIR_B), lower], { wallet });
    expect(r.outcomes).toHaveLength(1);
    expect(r.outcomes[0].vault).toBe(getAddress(HEIR_B));
    expect(sent).toHaveLength(1);
  });

  it('never sends for a vault the keeper wallet owns before release', async () => {
    const owned = makeSnapshot({ pending: 'grace', now: 3n * DAY, owner: KEEPER });
    const { atro, sent } = fakeAtro({ snapshot: async () => owned });
    const r = await keeperTick(atro, [VAULT], { wallet });
    expect(sent).toEqual([]);
    expect(r.outcomes[0]).toMatchObject({
      status: 'owner-wallet',
      decision: { action: 'poke', reason: 'TRANSITION_DUE' },
      error: { code: 'WRONG_ACCOUNT' },
      nextCheckAt: 3n * DAY,
    });
    // After release nothing is left to check in, so the owner's wallet may distribute.
    const released = makeSnapshot({ state: 'releasedInherit', now: 7n * DAY, owner: KEEPER });
    const after = fakeAtro({ snapshot: async () => released });
    expect((await keeperTick(after.atro, [VAULT], { wallet })).outcomes[0].status).toBe('sent');
  });

  it('treats a NO_EFFECT warning as idle and sends nothing', async () => {
    const warnings = [{ code: 'NO_EFFECT', message: 'Nothing would change.' }] as unknown as Warning[];
    const { atro, sent } = fakeAtro({ warnings });
    const r = await keeperTick(atro, [VAULT], { wallet });
    expect(sent).toEqual([]);
    expect(r.outcomes[0]).toMatchObject({ status: 'idle', nextCheckAt: 7n * DAY + 3600n });
  });

  it('counts every attempt against maxTx', async () => {
    const { atro } = fakeAtro({ sim: () => ({ ok: true, gas: 4_000_001n }) });
    const r = await keeperTick(atro, [A, B], { wallet, maxTx: 1 });
    expect(r.outcomes.map((x) => x.status)).toEqual(['gas-cap', 'limit']);
  });

  it.each([
    ['maxTx', { maxTx: Number.NaN }],
    ['maxTx', { maxTx: -1 }],
    ['maxTx', { maxTx: 1.5 }],
    ['maxGas', { maxGas: 0n }],
    ['maxGas', { maxGas: 5 as unknown as bigint }],
    ['minBalance', { minBalance: -1n }],
    ['distributeEvery', { distributeEvery: 0n }],
    ['distributeEvery', { distributeEvery: -3600n }],
  ])('rejects bad %s before any RPC call', async (path, bad) => {
    const { atro } = fakeAtro();
    (atro.publicClient as unknown as { getBlock: () => never }).getBlock = () => {
      throw new Error('no RPC call is expected');
    };
    await expect(keeperTick(atro, [VAULT], { wallet, ...bad })).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
      details: { path },
    });
  });

  it('accepts maxTx 0: every actionable vault is limited', async () => {
    const r = await keeperTick(fakeAtro().atro, [VAULT], { wallet, maxTx: 0 });
    expect(r.outcomes[0].status).toBe('limit');
  });

  it('stops before reading any vault when the balance is below minBalance', async () => {
    const { atro } = fakeAtro({ balance: 1n });
    const r = await keeperTick(atro, [VAULT], { wallet });
    expect(r).toMatchObject({ stopped: 'LOW_BALANCE', sent: 0, outcomes: [], balance: 1n });
  });

  it('is a dry run without a wallet', async () => {
    const { atro, sent } = fakeAtro();
    const r = await keeperTick(atro, [VAULT]);
    expect(r).toMatchObject({ dryRun: true, keeper: null, balance: null, sent: 0 });
    expect(r.outcomes[0].status).toBe('dry-run');
    expect(sent).toEqual([]);
  });
});
