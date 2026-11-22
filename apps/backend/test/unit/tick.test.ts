import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tick } from '../../src/functions/tick';
import { KEEPER_KEY_INVALID } from '../../src/keeper/signer';
import { getCursor, getMeta, leaseUntil, tryLease } from '../../src/store/meta';
import { LEASE_TTL_MS, runTick, TICK_LEASE } from '../../src/tick/run';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { created, T0, txh, VAULT, VAULT2, vaultEvent, view } from '../helpers/fixtures';
import { API, bodyOf } from '../helpers/http';
import { activeSubscriber } from '../helpers/seed';

describe('runTick (spec §9.3)', () => {
  let db: TestDb;
  let env: TestEnv;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
    env.chain.created = [created()];
    env.chain.logs = [vaultEvent('Alive', { at: T0 - 100n }, { blockNumber: 150n, transactionHash: txh(1) })];
    // Seen at T0: checked in at T0 - 100, late at T0 + 20, so 83% of the period is past (the 80% reminder).
    env.chain.setView(view({ lastAlive: T0 - 100n, lateAt: T0 + 20n, nextCheckAt: T0 + 20n }));
  });

  it('indexes, reminds and runs the keeper in one call, then frees the lease', async () => {
    await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' });
    const r = await runTick(env.d);
    expect(r.status).toBe('ok');
    expect(r.errors).toEqual([]);
    expect(r.head).toBe(200n);
    expect(r.indexer).toMatchObject({ caughtUp: true, created: 1, events: 1 });
    expect(r.notices).toMatchObject({ sent: 1, reminders: 1 });
    expect(r.keeper).toMatchObject({ ran: true, due: 0 });
    expect(env.mailer.byKind('checkin-80')).toHaveLength(1);
    expect(await getMeta(db, TICK_LEASE)).toBeNull();
    const again = await runTick(env.d);
    expect(again.notices).toMatchObject({ sent: 0 });
  });

  it('returns locked and touches nothing while another tick holds the lease (review focus 4)', async () => {
    expect(await tryLease(db, TICK_LEASE, env.clock.now(), 120_000)).toBe(true);
    const r = await runTick(env.d);
    expect(r).toEqual({ status: 'locked', head: null, indexer: null, notices: null, keeper: null, errors: [] });
    expect(env.chain.calls.scan).toEqual([]);
    expect(env.chain.calls.keeper).toEqual([]);
    expect(await getMeta(db, TICK_LEASE)).not.toBeNull();
    env.clock.advance(121_000);
    expect((await runTick(env.d)).status).toBe('ok');
  });

  it('reports a failed head read as partial and still frees the lease', async () => {
    env.chain.head = async () => {
      throw new Error('rpc down');
    };
    const r = await runTick(env.d);
    expect(r).toMatchObject({ status: 'partial', errors: ['head: rpc down'] });
    expect(await getMeta(db, TICK_LEASE)).toBeNull();
  });

  it('keeps the RPC URL out of the response body and the log when the head read fails (M6)', async () => {
    env.chain.head = async () => {
      throw new Error('HTTP request failed. URL: https://rpc.example/key-abc');
    };
    const res = await tick(
      new Request(`${API}/tick`, { method: 'POST', headers: { 'x-cron-secret': 'c'.repeat(32) } }),
      env.d,
    );
    const body = await bodyOf(res);
    expect(body).toMatchObject({ status: 'partial', errors: ['head: HTTP request failed. URL: <url>'] });
    expect(JSON.stringify(body)).not.toContain('key-abc');
    expect(JSON.stringify(env.log.lines)).not.toContain('key-abc');
  });

  it('keeps going when one phase fails', async () => {
    env.chain.keeperImpl = async () => {
      throw new Error('keeper rpc down');
    };
    const r = await runTick(env.d);
    expect(r.status).toBe('partial');
    expect(r.errors).toEqual(['keeper: keeper rpc down']);
    expect(r.indexer).toMatchObject({ caughtUp: true });
  });

  it('alerts ops once about an unusable keeper secret', async () => {
    env = testEnv(db, { keeperError: KEEPER_KEY_INVALID });
    env.chain.setView(view());
    await runTick(env.d);
    await runTick(env.d);
    const alerts = env.mailer.sent.filter((m) => m.to === 'ops@atropyle.test');
    expect(alerts.map((m) => m.subject)).toEqual(['[Atropyle ops] keeper-key: firing']);
  });

  it('is only reachable with the cron secret', async () => {
    const call = (headers: Record<string, string>) =>
      tick(new Request(`${API}/tick`, { method: 'POST', headers }), env.d);
    const denied = await call({});
    expect(denied.status).toBe(401);
    expect(await bodyOf(denied)).toMatchObject({ code: 'UNAUTHORIZED' });
    expect((await call({ 'x-cron-secret': 'wrong' })).status).toBe(401);
    const ok = await call({ 'x-cron-secret': 'c'.repeat(32) });
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toMatchObject({ status: 'ok', head: '200' });
  });

  it('stops cleanly when the 50 s budget is used up, with the cursor saved and the lease freed', async () => {
    // The scan itself takes longer than the whole budget: the later phases find no time left.
    const scan = env.chain.scan.bind(env.chain);
    env.chain.scan = async (o) => {
      const r = await scan(o);
      env.clock.advance(60_000);
      return r;
    };
    const r = await runTick(env.d);
    expect(r.status).toBe('ok');
    expect(r.keeper).toMatchObject({ ran: false });
    expect(env.chain.calls.keeper).toEqual([]);
    expect(await getCursor(db)).toBe(200n - BigInt(env.d.config.headMargin));
    expect(await getMeta(db, TICK_LEASE)).toBeNull();
  });

  it('stops the keeper of a run whose lease another run took over, so two runs never both keep (I1)', async () => {
    // A budget longer than the lease, so only the lease (not the deadline) can stop run A here.
    env.d.config.budgetMs = 600_000;
    // Two vaults due for the keeper at T0.
    env.chain.created = [created(), created({ vault: VAULT2, blockNumber: 151n, transactionHash: txh(2) })];
    env.chain.setView(view({ nextCheckAt: T0 }));
    env.chain.setView(view({ vault: VAULT2, nextCheckAt: T0 }));
    let taken: string | null = null;
    env.chain.keeperImpl = async (run) => {
      // Run A is slow: its lease runs out during this call and run B takes the tick over.
      env.clock.advance(121_000);
      expect(await tryLease(db, TICK_LEASE, env.clock.now(), LEASE_TTL_MS)).toBe(true);
      taken = leaseUntil(env.clock.now(), LEASE_TTL_MS);
      return {
        ranAt: T0,
        dryRun: false,
        keeper: null,
        balance: 10n ** 18n,
        stopped: null,
        sent: 1,
        outcomes: run.vaults.map((vault) => ({
          vault,
          decision: { vault, action: 'poke' as const, reason: 'TRANSITION_DUE' as const, nextCheckAt: T0 },
          status: 'sent' as const,
          hash: txh(40),
          nextCheckAt: T0 + 60n,
        })),
      };
    };
    const a = await runTick(env.d);
    expect(env.chain.calls.keeper.map((c) => c.vaults)).toEqual([[VAULT]]);
    expect(a.keeper).toMatchObject({ due: 2, sent: 1, stopped: 'LEASE_LOST' });
    // A's end leaves B's lease in place.
    expect(await getMeta(db, TICK_LEASE)).toMatchObject({ value: { until: taken } });
  });

  it("a run that outlived its lease does not delete the next run's lease", async () => {
    let started: Promise<unknown> | undefined;
    const keeper = env.chain.keeperImpl;
    env.chain.keeperImpl = async (run) => {
      // While run A is inside its keeper phase, its lease expires and run B takes it.
      env.clock.advance(121_000);
      expect(await tryLease(db, TICK_LEASE, env.clock.now(), 120_000)).toBe(true);
      return keeper(run);
    };
    started = runTick(env.d);
    await started;
    expect(await getMeta(db, TICK_LEASE)).not.toBeNull();
  });
});
