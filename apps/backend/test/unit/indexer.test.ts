import type { Address } from 'viem';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getCursor, getMeta } from '../../src/store/meta';
import { getVault, knownVaults } from '../../src/store/vaults';
import { runIndexer } from '../../src/tick/indexer';
import { runNotices } from '../../src/tick/notices';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { created, HEIR, OWNER, T0, TARGET, txh, VAULT, VAULT2, vaultEvent, view } from '../helpers/fixtures';
import { activeSubscriber } from '../helpers/seed';

const eventsOf = (db: TestDb) =>
  db.query<{ name: string; block: string; at: string; args: Record<string, unknown> }>(
    'select name, block::text as block, at::text as at, args from public.vault_events order by block, log_index',
  );

const unnotifiedOf = async (db: TestDb, vault: Address) =>
  (
    await db.query<{ n: number }>(
      'select count(*)::int as n from public.vault_events where vault = $1::text and notified_at is null',
      [vault.toLowerCase()],
    )
  )[0].n;

describe('runIndexer (spec §9.3.1)', () => {
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
    env = testEnv(db, { config: { stepBlocks: 50 } });
    // VAULT is created at block 150 and checks in at 190; VAULT2 is created at 120.
    env.chain.created = [created(), created({ vault: VAULT2, blockNumber: 120n, transactionHash: txh(2) })];
    env.chain.logs = [
      vaultEvent('Alive', { at: T0 - 50n }, { blockNumber: 150n, logIndex: 0, transactionHash: txh(1) }),
      vaultEvent('Alive', { at: T0 - 10n }, { blockNumber: 190n, logIndex: 3, transactionHash: txh(3) }),
      vaultEvent('RecoveryVoted', { guardian: HEIR, target: TARGET }, { blockNumber: 199n, transactionHash: txh(4) }),
      vaultEvent('Alive', { at: T0 - 80n }, { address: VAULT2, blockNumber: 120n, transactionHash: txh(2) }),
    ];
    env.chain.setView(view({ lastAlive: T0 - 10n }));
    env.chain.setView(view({ vault: VAULT2, lastAlive: T0 - 80n, nextCheckAt: null }));
  });

  it('indexes from the factory block to head − margin in committed steps', async () => {
    const r = await runIndexer(env.d, await env.chain.head(), far());
    expect(r).toEqual({
      from: 100n,
      to: 197n,
      target: 197n,
      steps: 2,
      created: 2,
      events: 3,
      views: 2,
      staleViews: 0,
      caughtUp: true,
      error: null,
    });
    expect(env.chain.calls.scan.map((s) => [s.resume.toBlock, s.toBlock])).toEqual([
      [99n, 149n],
      [149n, 197n],
    ]);
    expect(await getCursor(db)).toBe(197n);
    expect(await knownVaults(db)).toEqual([VAULT2, VAULT]);
    // The event at block 199 is above head − 3 and waits for the next run.
    expect((await eventsOf(db)).map((e) => [e.name, e.block])).toEqual([
      ['Alive', '120'],
      ['Alive', '150'],
      ['Alive', '190'],
    ]);
    expect((await eventsOf(db))[2]).toMatchObject({ at: String(T0 - 10n), args: { at: String(T0 - 10n) } });
    expect(await getVault(db, VAULT)).toMatchObject({
      owner: OWNER,
      drill: true,
      state: 'active',
      lastAlive: T0 - 10n,
      lastAliveBlock: 190n,
      lateAt: T0 + 110n,
      nextCheckAt: T0 + 110n,
      assets: [{ index: 0, kind: 'erc20', token: view().assets[0].token, id: '0', decimals: 6 }],
    });
    const roles = await db.query<{ role: string }>(
      'select role from public.vault_roles where vault = $1::text order by role',
      [VAULT.toLowerCase()],
    );
    expect(roles.map((x) => x.role)).toEqual(['guardian', 'heir', 'owner']);
    expect(await getMeta(db, 'indexer')).toMatchObject({ value: { block: '197', head: '200' } });
  });

  it('does at most maxBlocksPerRun blocks per run and resumes from the cursor', async () => {
    env.chain.headBlock = 5_000n;
    env.d.config.stepBlocks = 500;
    const first = await runIndexer(env.d, await env.chain.head(), far());
    expect(first).toMatchObject({ from: 100n, to: 2_099n, steps: 4, caughtUp: false, error: null });
    const second = await runIndexer(env.d, await env.chain.head(), far());
    expect(second).toMatchObject({ from: 2_100n, to: 4_099n, caughtUp: false });
    const third = await runIndexer(env.d, await env.chain.head(), far());
    expect(third).toMatchObject({ from: 4_100n, to: 4_997n, caughtUp: true });
  });

  it('keeps the cursor at the last committed step when a scan fails, and the rerun adds no duplicate (review focus 3)', async () => {
    env.chain.failScan = (from) => from === 150n;
    const failed = await runIndexer(env.d, await env.chain.head(), far());
    expect(failed).toMatchObject({ steps: 1, to: 149n, caughtUp: false, error: 'scan 150-197 failed' });
    expect(await getCursor(db)).toBe(149n);
    expect(await eventsOf(db)).toHaveLength(1);
    expect(env.log.lines.some((l) => l.level === 'warn' && l.msg === 'indexer step failed')).toBe(true);

    env.chain.failScan = null;
    const rerun = await runIndexer(env.d, await env.chain.head(), far());
    expect(rerun).toMatchObject({ from: 150n, to: 197n, caughtUp: true, error: null, events: 2 });
    // Even a full re-scan from scratch stores nothing new.
    await db.query('update public.cursors set block = 99');
    const again = await runIndexer(env.d, await env.chain.head(), far());
    expect(again).toMatchObject({ events: 0, created: 2, caughtUp: true });
    expect(await eventsOf(db)).toHaveLength(3);
  });

  it('moves the cursor past a vault whose view keeps failing; the others get views and notices, its events wait (C2)', async () => {
    env.chain.logs.push(
      vaultEvent('RecoveryVoted', { guardian: HEIR, target: TARGET }, { blockNumber: 170n, transactionHash: txh(5) }),
      vaultEvent(
        'RecoveryVoted',
        { guardian: HEIR, target: TARGET },
        { address: VAULT2, blockNumber: 160n, transactionHash: txh(6) },
      ),
    );
    await activeSubscriber(db, { email: 'a@example.com', vault: VAULT, role: 'owner' });
    await activeSubscriber(db, { email: 'b@example.com', vault: VAULT2, role: 'owner' });
    // VAULT2 is created in the first step and touched again in the second; its view always fails.
    env.chain.failView.add(VAULT2.toLowerCase());
    const r = await runIndexer(env.d, await env.chain.head(), far());
    expect(r).toMatchObject({ to: 197n, steps: 2, created: 2, events: 5, views: 1, staleViews: 1, caughtUp: true });
    expect(r.error).toBeNull();
    expect(await getCursor(db)).toBe(197n);
    // The new vault is stored without a view, and its failing read is not repeated within the run.
    expect(await knownVaults(db)).toEqual([VAULT2, VAULT]);
    expect(await getVault(db, VAULT2)).toMatchObject({ owner: OWNER, viewBlock: null });
    expect(await getVault(db, VAULT)).toMatchObject({ viewBlock: 200n, lastAliveBlock: 190n });
    expect(env.chain.calls.view.filter((v) => v === VAULT2)).toHaveLength(1);
    expect(env.log.lines.some((l) => l.msg === 'vault view failed' && l.data.vault === VAULT2)).toBe(true);

    await runNotices(env.d, T0, far(), true);
    expect(env.mailer.byKind('recovery-vote').map((m) => m.to)).toEqual(['a@example.com']);
    expect(await unnotifiedOf(db, VAULT2)).toBe(2);

    // Within its one-minute back-off the view is not read again, and the event keeps waiting.
    env.clock.advance(30_000);
    expect(await runIndexer(env.d, await env.chain.head(), far())).toMatchObject({ views: 0, staleViews: 1 });
    expect(env.chain.calls.view.filter((v) => v === VAULT2)).toHaveLength(1);
    await runNotices(env.d, T0, far(), true);
    expect(await unnotifiedOf(db, VAULT2)).toBe(2);

    // Once the view reads, the vault is complete and its event is mailed.
    env.chain.failView.clear();
    env.clock.advance(30_000);
    expect(await runIndexer(env.d, await env.chain.head(), far())).toMatchObject({ views: 1, staleViews: 0 });
    expect(await getVault(db, VAULT2)).toMatchObject({ viewBlock: 200n, lastAlive: T0 - 80n, lastAliveBlock: 120n });
    await runNotices(env.d, T0, far(), true);
    expect(
      env.mailer
        .byKind('recovery-vote')
        .map((m) => m.to)
        .sort(),
    ).toEqual(['a@example.com', 'b@example.com']);
    expect(await unnotifiedOf(db, VAULT2)).toBe(0);
  });

  it('backs a failing view off from 1 minute, doubling up to 1 hour, and keeps its last good view (C2)', async () => {
    await runIndexer(env.d, await env.chain.head(), far());
    env.chain.headBlock = 210n;
    env.chain.logs.push(vaultEvent('Alive', { at: T0 + 5n }, { blockNumber: 205n, transactionHash: txh(7) }));
    env.chain.failView.add(VAULT.toLowerCase());
    const delays: number[] = [];
    let staleSince: string | null = null;
    for (let i = 0; i < 9; i++) {
      await runIndexer(env.d, await env.chain.head(), far());
      const [row] = await db.query<{ since: Date; retry: Date; failures: number }>(
        'select view_stale_since as since, view_retry_at as retry, view_failures as failures from public.vaults where address = $1::text',
        [VAULT.toLowerCase()],
      );
      staleSince ??= row.since.toISOString();
      expect(row.since.toISOString()).toBe(staleSince);
      expect(row.failures).toBe(i + 1);
      delays.push((row.retry.getTime() - env.clock.now()) / 60_000);
      env.clock.set(row.retry.getTime());
    }
    expect(delays).toEqual([1, 2, 4, 8, 16, 32, 60, 60, 60]);
    expect(await getVault(db, VAULT)).toMatchObject({ viewBlock: 200n, lastAlive: T0 - 10n });
  });

  it('marks a view it had no time to read stale, and reads it on the next run (C2, I1)', async () => {
    env.d.config.stepBlocks = 500;
    const read = env.chain.view.bind(env.chain);
    env.chain.view = async (a) => {
      env.clock.advance(20_000);
      return read(a);
    };
    const deadline = env.clock.now() + 10_000;
    const r = await runIndexer(env.d, await env.chain.head(), deadline);
    // One step: VAULT (created at 150) is read and uses up the time, VAULT2 (created at 120) is left for later.
    expect(r).toMatchObject({ steps: 1, to: 197n, views: 1, staleViews: 1, caughtUp: true });
    expect(await getVault(db, VAULT2)).toMatchObject({ viewBlock: null });
    const [row] = await db.query<{ failures: number; due: boolean }>(
      'select view_failures as failures, view_retry_at <= $2::timestamptz as due from public.vaults where address = $1::text',
      [VAULT2.toLowerCase(), new Date(env.clock.now()).toISOString()],
    );
    expect(row).toEqual({ failures: 0, due: true });
    const next = await runIndexer(env.d, await env.chain.head(), env.clock.now() + 60_000);
    expect(next).toMatchObject({ steps: 0, views: 1, staleViews: 0 });
    expect(await getVault(db, VAULT2)).toMatchObject({ viewBlock: 200n });
  });

  it('keeps a vault stale while its view is older than its newest event, as from a lagging RPC node (C2)', async () => {
    env.chain.setView(view({ lastAlive: T0 - 50n, blockNumber: 180n }));
    const r = await runIndexer(env.d, await env.chain.head(), far());
    expect(r).toMatchObject({ to: 197n, staleViews: 1 });
    expect(await getVault(db, VAULT)).toMatchObject({ viewBlock: 180n });
    env.chain.setView(view({ lastAlive: T0 - 10n, blockNumber: 200n }));
    expect(await runIndexer(env.d, await env.chain.head(), far())).toMatchObject({ views: 1, staleViews: 0 });
    expect(await getVault(db, VAULT)).toMatchObject({ viewBlock: 200n, lastAliveBlock: 190n });
  });

  it('does nothing once the deadline has passed, and nothing when already at head − margin', async () => {
    const late = await runIndexer(env.d, await env.chain.head(), env.clock.now());
    expect(late).toMatchObject({ steps: 0, caughtUp: false });
    expect(await getCursor(db)).toBeNull();
    await runIndexer(env.d, await env.chain.head(), far());
    const idle = await runIndexer(env.d, await env.chain.head(), far());
    expect(idle).toMatchObject({ steps: 0, from: 198n, to: 197n, caughtUp: true });
  });

  it('picks up the next blocks once the head moves on', async () => {
    await runIndexer(env.d, await env.chain.head(), far());
    env.chain.headBlock = 210n;
    env.chain.headTime = T0 + 10n;
    const r = await runIndexer(env.d, await env.chain.head(), far());
    expect(r).toMatchObject({ from: 198n, to: 207n, events: 1 });
    const voted = (await eventsOf(db)).find((e) => e.name === 'RecoveryVoted');
    expect(voted?.args).toEqual({ guardian: HEIR, target: TARGET });
  });
});
