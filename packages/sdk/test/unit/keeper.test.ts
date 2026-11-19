import type { WalletClient } from 'viem';
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
} from '../../src/index';
import { DAY, HEIR_A, makeSnapshot, type SnapOptions, VAULT } from './fixtures';

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

function fakeAtro(o: { sim: () => Simulation; snapshot?: () => Promise<unknown>; balance?: bigint }) {
  const sent: TxPlan[] = [];
  const atro = {
    publicClient: {
      getBlock: async () => ({ timestamp: 7n * DAY }),
      getBalance: async () => o.balance ?? ENOUGH,
    },
    engineFor: async () => engine,
    vault: () => ({
      snapshot: o.snapshot ?? (async () => RELEASED),
      prepare: async (): Promise<TxPlan> => ({
        chainId: 31337,
        from: KEEPER,
        vault: VAULT,
        steps: [{ simulation: o.sim() } as TxPlan['steps'][number]],
        summary: '',
        warnings: [],
      }),
    }),
    send: async (plan: TxPlan) => {
      sent.push(plan);
      return { vault: VAULT, steps: [{ hash: `0x${'ab'.repeat(32)}` }] };
    },
  } as unknown as AtropyleClient;
  return { atro, sent };
}

const wallet = { account: { address: KEEPER } } as unknown as WalletClient;

describe('keeperTick', () => {
  it('skips a vault whose estimate is over maxGas and retries it in RETRY_AFTER seconds', async () => {
    const { atro, sent } = fakeAtro({ sim: () => ({ ok: true, gas: 4_000_001n }) });
    const r = await keeperTick(atro, [VAULT], { wallet });
    expect(r.outcomes[0]).toMatchObject({ status: 'gas-cap', nextCheckAt: 7n * DAY + 300n });
    expect(sent).toEqual([]);
    const within = fakeAtro({ sim: () => ({ ok: true, gas: 4_000_000n }) });
    expect((await keeperTick(within.atro, [VAULT], { wallet })).outcomes[0].status).toBe('sent');
  });

  it('reports a revert as simulation-failed, not as a thrown error', async () => {
    const error = new AtropyleError('ALREADY_RELEASED').toJSON();
    const { atro } = fakeAtro({ sim: () => ({ ok: false, error }) });
    const r = await keeperTick(atro, [VAULT], { wallet });
    expect(r.outcomes[0]).toMatchObject({ status: 'simulation-failed', error, nextCheckAt: 7n * DAY + 300n });
  });

  it('rethrows a transport failure instead of reading it as a skip reason', async () => {
    const down = () => {
      throw new AtropyleError('RPC_UNAVAILABLE');
    };
    const read = fakeAtro({ sim: () => ({ ok: true, gas: 1n }), snapshot: async () => down() });
    await expect(keeperTick(read.atro, [VAULT], { wallet })).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
    const sim = fakeAtro({ sim: down });
    await expect(keeperTick(sim.atro, [VAULT], { wallet })).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
  });

  it('stops before reading any vault when the balance is below minBalance', async () => {
    const { atro } = fakeAtro({ sim: () => ({ ok: true, gas: 1n }), balance: 1n });
    const r = await keeperTick(atro, [VAULT], { wallet });
    expect(r).toMatchObject({ stopped: 'LOW_BALANCE', sent: 0, outcomes: [], balance: 1n });
  });

  it('is a dry run without a wallet', async () => {
    const { atro, sent } = fakeAtro({ sim: () => ({ ok: true, gas: 1n }) });
    const r = await keeperTick(atro, [VAULT]);
    expect(r).toMatchObject({ dryRun: true, keeper: null, balance: null, sent: 0 });
    expect(r.outcomes[0].status).toBe('dry-run');
    expect(sent).toEqual([]);
  });
});
