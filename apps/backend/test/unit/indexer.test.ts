import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getCursor, getMeta } from '../../src/store/meta';
import { getVault, knownVaults } from '../../src/store/vaults';
import { runIndexer } from '../../src/tick/indexer';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { created, HEIR, OWNER, T0, TARGET, txh, VAULT, VAULT2, vaultEvent, view } from '../helpers/fixtures';

const eventsOf = (db: TestDb) =>
  db.query<{ name: string; block: string; at: string; args: Record<string, unknown> }>(
    'select name, block::text as block, at::text as at, args from public.vault_events order by block, log_index',
  );

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

  it('aborts the step when a view cannot be read, without moving the cursor', async () => {
    env.chain.failView.add(VAULT.toLowerCase());
    const r = await runIndexer(env.d, await env.chain.head(), far());
    expect(r).toMatchObject({ steps: 1, to: 149n, error: `view of ${VAULT} failed` });
    expect(await getVault(db, VAULT)).toBeNull();
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
