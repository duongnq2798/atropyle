import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getCursor,
  getMeta,
  leaseUntil,
  releaseLease,
  renewLease,
  setCursor,
  setMeta,
  tryLease,
} from '../../src/store/meta';
import { type TestDb, testDb } from '../helpers/db';

const T = Date.parse('2026-11-23T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('meta store', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
  });

  it('stores the cursor as a bigint', async () => {
    expect(await getCursor(db)).toBeNull();
    await setCursor(db, 76_567_034n, iso(T));
    await setCursor(db, 76_567_134n, iso(T));
    expect(await getCursor(db)).toBe(76_567_134n);
  });

  it('stores JSON values with bigints as strings', async () => {
    expect(await getMeta(db, 'indexer')).toBeNull();
    await setMeta(db, 'indexer', { block: 5n, head: 9n }, iso(T));
    expect(await getMeta(db, 'indexer')).toEqual({ value: { block: '5', head: '9' }, updatedAt: iso(T) });
  });

  it('extends a lease only while it still carries the until its holder wrote (I1)', async () => {
    expect(await tryLease(db, 'lease:tick', T, 120_000)).toBe(true);
    const first = leaseUntil(T, 120_000);
    const renewed = await renewLease(db, 'lease:tick', first, T + 60_000, 120_000);
    expect(renewed).toBe(leaseUntil(T + 60_000, 120_000));
    expect(await renewLease(db, 'lease:tick', first, T + 61_000, 120_000)).toBeNull();
    expect(await tryLease(db, 'lease:tick', T + 150_000, 120_000)).toBe(false);
    // Another run takes the lease once it has expired: the first holder can no longer extend it.
    expect(await tryLease(db, 'lease:tick', T + 181_000, 120_000)).toBe(true);
    expect(await renewLease(db, 'lease:tick', renewed as string, T + 182_000, 120_000)).toBeNull();
    expect(await getMeta(db, 'lease:tick')).toMatchObject({ value: { until: leaseUntil(T + 181_000, 120_000) } });
  });

  it('grants a lease to one holder until it expires or is released', async () => {
    expect(await tryLease(db, 'lease:tick', T, 120_000)).toBe(true);
    expect(await tryLease(db, 'lease:tick', T + 60_000, 120_000)).toBe(false);
    expect(await tryLease(db, 'lease:tick', T + 121_000, 120_000)).toBe(true);
    await releaseLease(db, 'lease:tick');
    expect(await tryLease(db, 'lease:tick', T + 122_000, 120_000)).toBe(true);
  });
});
