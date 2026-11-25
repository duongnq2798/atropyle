import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saveIntegrity } from '../../src/store/integrity';
import { getMeta, setMeta } from '../../src/store/meta';
import { MIGRATIONS_DIR, type TestDb, testDb } from '../helpers/db';
import { T0, view } from '../helpers/fixtures';
import { seedVault } from '../helpers/seed';

const UNWRAP = readFileSync(join(MIGRATIONS_DIR, '20261125000000_jsonb_unwrap.sql'), 'utf8');
const ISO = '2026-11-25T12:00:00.000Z';

/** What postgres.js stored before the adapter fix: the JSON text of each value, as a JSON string. */
const DOUBLE_ENCODE = `
  update public.meta set value = to_jsonb(value::text);
  update public.vault_events set args = to_jsonb(args::text);
  update public.vaults set assets = to_jsonb(assets::text), last_alive_block = null;
  update public.integrity_runs set report = to_jsonb(report::text);`;

describe('migration 20261125000000_jsonb_unwrap', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });

  const snapshot = async () => ({
    meta: await db.query('select key, value from public.meta order by key'),
    events: await db.query('select tx_hash, args from public.vault_events order by tx_hash'),
    vaults: await db.query(
      'select address, assets, last_alive_block::text as last_alive_block from public.vaults order by address',
    ),
    reports: await db.query('select id, report from public.integrity_runs order by id'),
  });

  it('turns the JSON strings back into objects and links last_alive_block again, once or twice', async () => {
    await seedVault(db, view(), { aliveBlock: 160n });
    await setMeta(db, 'indexer', { block: 197n, head: 200n }, ISO);
    await saveIntegrity(
      db,
      { ok: true, chainId: 196, blockNumber: 199n, blockTimestamp: T0, rpcs: 2, checks: [], warnings: [] },
      ISO,
    );
    const good = await snapshot();
    expect(good.vaults[0].last_alive_block).toBe('160');

    await db.pg.exec(DOUBLE_ENCODE);
    const wrapped = (await getMeta(db, 'indexer'))?.value;
    expect(typeof wrapped).toBe('string');
    expect(JSON.parse(wrapped as string)).toEqual({ block: '197', head: '200' });
    expect(await snapshot()).not.toEqual(good);

    await db.pg.exec(UNWRAP);
    expect(await snapshot()).toEqual(good);
    await db.pg.exec(UNWRAP);
    expect(await snapshot()).toEqual(good);
  });
});
