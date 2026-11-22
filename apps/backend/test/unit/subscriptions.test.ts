import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex, unsubToken } from '../../src/crypto';
import { claimDelivery, completeDelivery, releaseDelivery } from '../../src/store/deliveries';
import { HOUR_MS, hit, retryAfterSeconds } from '../../src/store/ratelimit';
import { activeSubscribers, confirmByHash, deleteByUnsubHash, upsertPending } from '../../src/store/subscriptions';
import { type TestDb, testDb } from '../helpers/db';
import { VAULT } from '../helpers/fixtures';
import { activeSubscriber } from '../helpers/seed';

const SECRET = 't'.repeat(32);
const NOW = '2026-11-23T12:00:00.000Z';
const h = (n: number) => String(n).repeat(64).slice(0, 64);

describe('subscription store', () => {
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

  const pending = (email: string, confirmHash: string, lang: 'en' | 'vi' = 'en') =>
    upsertPending(db, { email, vault: VAULT, role: 'heir', lang, confirmHash, tokenSecret: SECRET, nowIso: NOW });

  it('keeps one row per (email, vault, role) whatever the case of the email, and refreshes it while pending', async () => {
    const a = await pending('Alice@Example.com', h(1));
    const b = await pending('alice@example.COM', h(2), 'vi');
    expect(a).toMatchObject({ status: 'pending' });
    expect(b).toEqual(a);
    const rows = await db.query<{ n: number; confirm_hash: string; lang: string; unsub_hash: string }>(
      'select count(*) over ()::int as n, confirm_hash, lang, unsub_hash from public.subscriptions',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ n: 1, confirm_hash: h(2), lang: 'vi' });
    if (a.status !== 'pending') throw new Error('unreachable');
    expect(rows[0].unsub_hash).toBe(await sha256Hex(await unsubToken(SECRET, a.id)));
  });

  it('confirms once, stays active, and leaves an active row untouched by a new sign-up', async () => {
    await pending('bob@example.com', h(3));
    const first = await confirmByHash(db, h(3), NOW);
    expect(first).toMatchObject({ email: 'bob@example.com', role: 'heir', vault: VAULT, lang: 'en', was: 'pending' });
    expect(await confirmByHash(db, h(3), NOW)).toMatchObject({ was: 'active' });
    expect(await confirmByHash(db, h(9), NOW)).toBeNull();
    expect(await pending('bob@example.com', h(4))).toEqual({ status: 'active' });
    const [row] = await db.query<{ confirm_hash: string }>('select confirm_hash from public.subscriptions');
    expect(row.confirm_hash).toBe(h(3));
  });

  it('deletes by unsubscribe hash and lists only active subscribers', async () => {
    const sub = await activeSubscriber(db, { email: 'carol@example.com', vault: VAULT, role: 'owner' });
    await pending('dave@example.com', h(5));
    expect((await activeSubscribers(db, VAULT)).map((s) => s.email)).toEqual(['carol@example.com']);
    const token = await unsubToken(SECRET, sub.id);
    expect(await deleteByUnsubHash(db, await sha256Hex(token))).toBe(1);
    expect(await deleteByUnsubHash(db, await sha256Hex(token))).toBe(0);
    expect(await activeSubscribers(db, VAULT)).toEqual([]);
  });

  it('counts hits in fixed one-hour windows', async () => {
    const t = Date.parse('2026-11-23T12:59:00.000Z');
    expect(await hit(db, 'k', t)).toBe(1);
    expect(await hit(db, 'k', t + 30_000)).toBe(2);
    expect(await hit(db, 'k', t + 60_000)).toBe(1);
    expect(retryAfterSeconds(t)).toBe(60);
    expect(retryAfterSeconds(t + HOUR_MS)).toBe(60);
  });

  it('claims a delivery once, lets a stale unsent claim be taken again, and never re-claims a sent one', async () => {
    const sub = await activeSubscriber(db, { email: 'erin@example.com', vault: VAULT, role: 'owner' });
    const key = { subscriptionId: sub.id, kind: 'checkin-50' as const, periodKey: '150' };
    const t = Date.parse(NOW);
    expect(await claimDelivery(db, key, t)).toBe('claimed');
    expect(await claimDelivery(db, key, t + 60_000)).toBe('busy');
    expect(await claimDelivery(db, key, t + 11 * 60_000)).toBe('claimed');
    await releaseDelivery(db, key);
    expect(await claimDelivery(db, key, t + 12 * 60_000)).toBe('claimed');
    await completeDelivery(db, key, 'msg_1', t + 12 * 60_000);
    await releaseDelivery(db, key);
    expect(await claimDelivery(db, key, t + 60 * 60_000)).toBe('sent');
    const [row] = await db.query<{ provider_id: string }>('select provider_id from public.deliveries');
    expect(row.provider_id).toBe('msg_1');
  });
});
