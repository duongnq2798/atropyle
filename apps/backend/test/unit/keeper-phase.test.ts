import type { KeeperOutcome, KeeperReport } from '@atropyle/sdk';
import type { Address } from 'viem';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getMeta } from '../../src/store/meta';
import { getVault } from '../../src/store/vaults';
import { runKeeperPhase } from '../../src/tick/keeper';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { addr, T0, txh, VAULT, VAULT2, view } from '../helpers/fixtures';
import { seedVault } from '../helpers/seed';

const VAULT3 = addr(0xa003);
const KEEPER = addr(0x7777);
const ops = (env: TestEnv) => env.mailer.sent.filter((m) => m.to === 'ops@atropyle.test');

function report(over: Partial<KeeperReport> = {}): KeeperReport {
  return {
    ranAt: T0,
    dryRun: false,
    keeper: KEEPER,
    balance: 10n ** 18n,
    stopped: null,
    sent: 0,
    outcomes: [],
    ...over,
  };
}

describe('runKeeperPhase (spec §9.3.3)', () => {
  let db: TestDb;
  let env: TestEnv;
  const far = () => env.clock.now() + 60_000;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
    await seedVault(db, view({ nextCheckAt: T0 - 1n }));
    await seedVault(db, view({ vault: VAULT2, nextCheckAt: T0 + 500n }));
    await seedVault(db, view({ vault: VAULT3, nextCheckAt: T0 - 5n, expiresAt: T0 - 1n }));
  });

  it('runs the keeper over due, unexpired vaults and records what it sent', async () => {
    await db.query(
      `insert into public.keeper_log (vault, action, tx_hash, status, chain_at)
       values ($1::text, 'distribute', $2::text, 'sent', $3::bigint)`,
      [VAULT.toLowerCase(), txh(50), (T0 - 100n).toString()],
    );
    env.chain.keeperImpl = async (run) =>
      report({
        sent: 1,
        outcomes: [
          {
            vault: run.vaults[0],
            decision: { vault: run.vaults[0], action: 'poke', reason: 'TRANSITION_DUE', nextCheckAt: T0 },
            status: 'sent',
            hash: txh(99),
            nextCheckAt: T0,
          },
        ],
      });
    const r = await runKeeperPhase(env.d, T0, far());
    expect(r).toEqual({ ran: true, dryRun: false, due: 1, sent: 1, stopped: null });
    const [run] = env.chain.calls.keeper;
    expect(run.vaults).toEqual([VAULT]);
    expect(run.maxTx).toBe(20);
    expect(run.lastDistributeAt.get(VAULT)).toBe(T0 - 100n);
    const logs = await db.query<{ action: string; tx_hash: string; status: string; chain_at: string }>(
      'select action, tx_hash, status, chain_at::text as chain_at from public.keeper_log order by id',
    );
    expect(logs[1]).toEqual({ action: 'poke', tx_hash: txh(99), status: 'sent', chain_at: String(T0) });
    expect((await getVault(db, VAULT))?.nextCheckAt).toBe(T0);
    expect((await getMeta(db, 'keeper'))?.value).toEqual({
      lastRunAt: '2026-11-23T12:00:00.000Z',
      balanceWei: '1000000000000000000',
      dryRun: false,
      keeper: KEEPER,
      sent: 1,
      stopped: null,
    });
  });

  it('looks again in five minutes after a dry run, and logs neither a dry run nor an idle vault (M5)', async () => {
    env.chain.keeperImpl = async (run) =>
      report({
        dryRun: true,
        keeper: null,
        balance: null,
        outcomes: [
          {
            vault: run.vaults[0],
            decision: { vault: run.vaults[0], action: 'poke', reason: 'TRANSITION_DUE', nextCheckAt: T0 },
            status: 'dry-run',
            nextCheckAt: T0,
          },
        ],
      });
    await runKeeperPhase(env.d, T0, far());
    expect((await getVault(db, VAULT))?.nextCheckAt).toBe(T0 + 300n);
    expect(await db.query('select 1 from public.keeper_log')).toEqual([]);

    env.chain.keeperImpl = async (run) =>
      report({ outcomes: [{ vault: run.vaults[0], decision: null, status: 'idle', nextCheckAt: T0 + 400n }] });
    await db.query('update public.vaults set next_check_at = $1::bigint', [String(T0 - 1n)]);
    await runKeeperPhase(env.d, T0, far());
    expect(await db.query('select 1 from public.keeper_log')).toEqual([]);
  });

  it('caps transactions by the time left, and skips the keeper when almost none is left', async () => {
    await runKeeperPhase(env.d, T0, env.clock.now() + 5_000);
    expect(env.chain.calls.keeper[0].maxTx).toBe(2);
    const late = await runKeeperPhase(env.d, T0, env.clock.now() + 1_000);
    expect(late.ran).toBe(false);
    expect(env.chain.calls.keeper).toHaveLength(1);
  });

  const sentPoke = (vault: Address, n: number): KeeperOutcome => ({
    vault,
    decision: { vault, action: 'poke', reason: 'TRANSITION_DUE', nextCheckAt: T0 },
    status: 'sent',
    hash: txh(n),
    nextCheckAt: T0 + 60n,
  });
  const dueToo = (vault: Address) =>
    db.query('update public.vaults set next_check_at = $2::bigint where address = $1::text', [
      vault.toLowerCase(),
      String(T0 - 1n),
    ]);

  it('drives the keeper one vault at a time and commits each outcome right after its call (I1)', async () => {
    await dueToo(VAULT2);
    const seen: number[] = [];
    env.chain.keeperImpl = async (run) => {
      // Each call sees the rows committed by the calls before it.
      seen.push((await db.query('select 1 from public.keeper_log')).length);
      return report({ sent: 1, outcomes: run.vaults.map((v, i) => sentPoke(v, 90 + i + seen.length)) });
    };
    const r = await runKeeperPhase(env.d, T0, far());
    expect(env.chain.calls.keeper.map((c) => c.vaults)).toEqual([[VAULT], [VAULT2]]);
    expect(env.chain.calls.keeper.map((c) => c.maxTx)).toEqual([20, 19]);
    expect(seen).toEqual([0, 1]);
    expect(r).toEqual({ ran: true, dryRun: false, due: 2, sent: 2, stopped: null });
    expect((await getMeta(db, 'keeper'))?.value).toMatchObject({ sent: 2, stopped: null });
  });

  it('starts no vault after the deadline; earlier outcomes stay committed (I1)', async () => {
    await dueToo(VAULT2);
    env.chain.keeperImpl = async (run) => {
      env.clock.advance(20_000);
      return report({ sent: 1, outcomes: run.vaults.map((v) => sentPoke(v, 91)) });
    };
    const r = await runKeeperPhase(env.d, T0, env.clock.now() + 15_000);
    expect(env.chain.calls.keeper.map((c) => c.vaults)).toEqual([[VAULT]]);
    expect(r).toMatchObject({ ran: true, due: 2, sent: 1 });
    expect(await db.query('select vault, tx_hash from public.keeper_log')).toEqual([
      { vault: VAULT.toLowerCase(), tx_hash: txh(91) },
    ]);
    expect((await getVault(db, VAULT))?.nextCheckAt).toBe(T0 + 60n);
    expect((await getVault(db, VAULT2))?.nextCheckAt).toBe(T0 - 1n);
  });

  it('stops before a vault once the lease is lost, and after LOW_BALANCE (I1)', async () => {
    await dueToo(VAULT2);
    env.chain.keeperImpl = async (run) => report({ sent: 1, outcomes: run.vaults.map((v) => sentPoke(v, 92)) });
    let holds = 2;
    const lost = await runKeeperPhase(env.d, T0, far(), async () => holds-- > 1);
    expect(env.chain.calls.keeper.map((c) => c.vaults)).toEqual([[VAULT]]);
    expect(lost).toMatchObject({ ran: true, due: 2, sent: 1, stopped: 'LEASE_LOST' });

    env.chain.calls.keeper.length = 0;
    await db.query('update public.vaults set next_check_at = $1::bigint', [String(T0 - 1n)]);
    env.chain.keeperImpl = async () => report({ stopped: 'LOW_BALANCE', balance: 10n ** 15n });
    const low = await runKeeperPhase(env.d, T0, far());
    expect(env.chain.calls.keeper.map((c) => c.vaults)).toEqual([[VAULT]]);
    expect(low).toMatchObject({ ran: true, sent: 0, stopped: 'LOW_BALANCE' });
  });

  it('logs every broadcast hash before the database write, so a failed write still leaves it in the log (I1)', async () => {
    await db.query("update public.vaults set state = 'releasedInherit', released = true where address = $1::text", [
      VAULT.toLowerCase(),
    ]);
    env.chain.keeperImpl = async (run) =>
      report({
        sent: 1,
        outcomes: [
          {
            vault: run.vaults[0],
            decision: { vault: run.vaults[0], action: 'distribute', reason: 'DISTRIBUTE_DUE', nextCheckAt: T0 },
            status: 'sent',
            hash: txh(88),
            nextCheckAt: T0 + 3_600n,
          },
        ],
      });
    await db.query('alter table public.keeper_log add constraint keeper_log_down check (false) not valid');
    try {
      await expect(runKeeperPhase(env.d, T0, far())).rejects.toThrow(/keeper_log_down/);
    } finally {
      await db.query('alter table public.keeper_log drop constraint keeper_log_down');
    }
    expect(env.log.lines).toContainEqual({
      level: 'info',
      msg: 'keeper broadcast',
      data: { vault: VAULT, action: 'distribute', hash: txh(88) },
    });
  });

  it('alerts ops once when the balance runs low, and once when it recovers', async () => {
    env.chain.keeperImpl = async () => report({ stopped: 'LOW_BALANCE', balance: 10n ** 15n });
    await runKeeperPhase(env.d, T0, far());
    await runKeeperPhase(env.d, T0, far());
    expect(ops(env).map((m) => m.subject)).toEqual(['[Atropyle ops] keeper-balance: firing']);
    expect(ops(env)[0].text).toContain('1000000000000000 wei');
    env.chain.keeperImpl = async () => report();
    await runKeeperPhase(env.d, T0, far());
    expect(ops(env).map((m) => m.subject)).toEqual([
      '[Atropyle ops] keeper-balance: firing',
      '[Atropyle ops] keeper-balance: resolved',
    ]);
  });

  it('does not distribute again within the back-off: next_check_at becomes last distribute + 3600 (Task 5 review)', async () => {
    // A released vault that still has coverage: deriveView stores nextCheckAt = now for it.
    await db.query(
      'update public.vaults set state = $2::text, pending_state = $2::text, released = true, next_check_at = $3::bigint where address = $1::text',
      [VAULT2.toLowerCase(), 'releasedInherit', String(T0)],
    );
    await db.query('update public.vaults set next_check_at = $1::bigint where address = $2::text', [
      String(T0 + 9_999n),
      VAULT.toLowerCase(),
    ]);
    await db.query(
      `insert into public.keeper_log (vault, action, tx_hash, status, chain_at)
       values ($1::text, 'distribute', $2::text, 'sent', $3::bigint)`,
      [VAULT2.toLowerCase(), txh(60), (T0 - 600n).toString()],
    );
    // What the SDK does: a distribute within `distributeEvery` of the last one is DISTRIBUTE_BACKOFF, no transaction.
    env.chain.keeperImpl = async (run) =>
      report({
        outcomes: run.vaults.map((vault) => {
          const last = run.lastDistributeAt.get(vault);
          if (last === undefined) throw new Error(`no lastDistributeAt for ${vault}`);
          const nextCheckAt = last + 3_600n;
          return {
            vault,
            decision: { vault, action: null, reason: 'DISTRIBUTE_BACKOFF' as const, nextCheckAt },
            status: 'idle' as const,
            nextCheckAt,
          };
        }),
      });
    const r = await runKeeperPhase(env.d, T0, far());
    expect(r).toMatchObject({ ran: true, due: 1, sent: 0 });
    expect(env.chain.calls.keeper[0].vaults).toEqual([VAULT2]);
    expect(env.chain.calls.keeper[0].lastDistributeAt.get(VAULT2)).toBe(T0 - 600n);
    expect((await getVault(db, VAULT2))?.nextCheckAt).toBe(T0 - 600n + 3_600n);
    expect(await db.query("select 1 from public.keeper_log where status <> 'sent'")).toEqual([]);
    expect(await db.query('select 1 from public.keeper_log')).toHaveLength(1);
    // Not due again until the back-off is over.
    env.chain.calls.keeper.length = 0;
    await runKeeperPhase(env.d, T0 + 60n, far());
    expect(env.chain.calls.keeper[0].vaults).toEqual([]);
  });

  it('keeps the hash of a broadcast that then failed, and backs off the next distribute', async () => {
    await db.query("update public.vaults set state = 'releasedInherit', released = true where address = $1::text", [
      VAULT.toLowerCase(),
    ]);
    env.chain.keeperImpl = async (run) =>
      report({
        outcomes: [
          {
            vault: run.vaults[0],
            decision: { vault: run.vaults[0], action: 'distribute', reason: 'DISTRIBUTE_DUE', nextCheckAt: T0 },
            status: 'send-failed',
            error: {
              code: 'UNKNOWN',
              message: 'reverted',
              hint: '',
              docsUrl: '',
              details: { hash: txh(77) },
            },
            nextCheckAt: T0 + 300n,
          },
        ],
      });
    await runKeeperPhase(env.d, T0, far());
    const logs = await db.query<{ tx_hash: string; status: string; action: string }>(
      'select tx_hash, status, action from public.keeper_log',
    );
    expect(logs).toEqual([{ tx_hash: txh(77), status: 'send-failed', action: 'distribute' }]);
    env.chain.keeperImpl = async () => report();
    await runKeeperPhase(env.d, T0 + 300n, far());
    expect(env.chain.calls.keeper[1].lastDistributeAt.get(VAULT)).toBe(T0);
  });

  it('does not log or re-read an owner-wallet vault every minute', async () => {
    env.chain.keeperImpl = async (run) =>
      report({
        outcomes: [
          {
            vault: run.vaults[0],
            decision: { vault: run.vaults[0], action: 'poke', reason: 'TRANSITION_DUE', nextCheckAt: T0 },
            status: 'owner-wallet',
            error: { code: 'WRONG_ACCOUNT', message: 'owner', hint: '', docsUrl: '' },
            nextCheckAt: T0,
          },
        ],
      });
    await runKeeperPhase(env.d, T0, far());
    expect(await db.query('select 1 from public.keeper_log')).toEqual([]);
    expect((await getVault(db, VAULT))?.nextCheckAt).toBe(T0 + 300n);
  });
});
