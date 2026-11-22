import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EPOCH, health } from '../../src/functions/health';
import { me } from '../../src/functions/me';
import { stats } from '../../src/functions/stats';
import { saveIntegrity } from '../../src/store/integrity';
import { setCursor, setMeta } from '../../src/store/meta';
import { insertEvents } from '../../src/store/vaults';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { addr, GUARDIAN, HEIR, OWNER, T0, txh, VAULT, VAULT2, vaultEvent, view } from '../helpers/fixtures';
import { API, bodyOf, getReq } from '../helpers/http';
import { seedVault } from '../helpers/seed';

const ISO = '2026-11-23T12:00:00.000Z';

describe('GET /me, /stats, /health (spec §9.6)', () => {
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
    await seedVault(db, view());
    await seedVault(
      db,
      view({
        vault: VAULT2,
        drill: false,
        state: 'releasedInherit',
        pending: 'releasedInherit',
        released: true,
        roles: [
          { address: OWNER, role: 'owner' },
          { address: HEIR, role: 'heir' },
          { address: HEIR, role: 'guardian' },
        ],
      }),
      { createdBlock: 160n },
    );
    await setCursor(db, 197n, ISO);
  });

  it('lists the vaults of an address with its roles, newest first', async () => {
    const res = await me(getReq(`me?address=${HEIR.toLowerCase()}`, { origin: 'https://anywhere.example' }), env.d);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('public, max-age=15');
    expect(await bodyOf(res)).toEqual({
      address: HEIR,
      block: '197',
      vaults: [
        { vault: VAULT2, roles: ['guardian', 'heir'], drill: false, state: 'releasedInherit', released: true },
        { vault: VAULT, roles: ['heir'], drill: true, state: 'active', released: false },
      ],
    });
    const owner = await bodyOf<{ vaults: { roles: string[] }[] }>(await me(getReq(`me?address=${OWNER}`), env.d));
    expect(owner.vaults.map((v) => v.roles)).toEqual([['owner'], ['owner']]);
    const nobody = await bodyOf(await me(getReq(`me?address=${addr(0xdead)}`), env.d));
    expect(nobody).toEqual({ address: addr(0xdead), block: '197', vaults: [] });
  });

  it('refuses a missing or malformed address', async () => {
    for (const q of ['me', 'me?address=0x12', `me?address=${GUARDIAN}x`]) {
      const res = await me(getReq(q), env.d);
      expect(res.status, q).toBe(400);
      expect(await bodyOf(res)).toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it('counts vaults, Drills and check-ins as strings, cached for a minute', async () => {
    await insertEvents(db, [
      { event: vaultEvent('Alive', { at: T0 }, { blockNumber: 170n, transactionHash: txh(40) }), at: T0 },
    ]);
    const res = await stats(getReq('stats'), env.d);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await bodyOf(res)).toEqual({ block: '197', vaults: '2', drills: '1', checkIns: '1', updatedAt: ISO });
    expect((await stats(new Request(`${API}/stats`, { method: 'POST' }), env.d)).status).toBe(405);
  });

  it('reports an empty health before the first tick', async () => {
    await db.reset();
    const res = await health(getReq('health'), env.d);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await bodyOf(res)).toEqual({
      indexer: { block: '0', lagBlocks: 0, updatedAt: EPOCH },
      integrity: null,
      keeper: null,
    });
  });

  it('reports indexer lag, the latest integrity run and the keeper', async () => {
    await setMeta(db, 'indexer', { block: 197n, head: 200n }, ISO);
    await saveIntegrity(
      db,
      { ok: true, chainId: 196, blockNumber: 199n, blockTimestamp: T0, rpcs: 2, checks: [], warnings: [] },
      ISO,
    );
    await setMeta(
      db,
      'keeper',
      { lastRunAt: ISO, balanceWei: 5n * 10n ** 16n, dryRun: false, keeper: addr(0x7777), sent: 0, stopped: null },
      ISO,
    );
    expect(await bodyOf(await health(getReq('health'), env.d))).toEqual({
      indexer: { block: '197', lagBlocks: 3, updatedAt: ISO },
      integrity: { at: ISO, block: '199', ok: true },
      keeper: { lastRunAt: ISO, balanceWei: '50000000000000000', dryRun: false },
    });
  });
});
