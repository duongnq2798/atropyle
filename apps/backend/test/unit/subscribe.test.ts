import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { unsubToken } from '../../src/crypto';
import { confirm } from '../../src/functions/confirm';
import { isEmail, subscribe } from '../../src/functions/subscribe';
import { unsubscribe } from '../../src/functions/unsubscribe';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { VAULT, VAULT2, view } from '../helpers/fixtures';
import { API, bodyOf, postJson, tokenFrom } from '../helpers/http';
import { activeSubscriber } from '../helpers/seed';

const PROBLEM = 'application/problem+json; charset=utf-8';

describe('subscribe, confirm, unsubscribe (spec §9.6)', () => {
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
    env.chain.setView(view());
  });

  const sub = (body: Record<string, unknown>, o: { ip?: string; origin?: string | null } = {}) =>
    subscribe(postJson('subscribe', { vault: VAULT, role: 'heir', lang: 'en', website: '', ...body }, o), env.d);
  const rows = () =>
    db.query<{ email: string; status: string; lang: string }>(
      'select email::text as email, status, lang from public.subscriptions order by id',
    );

  it('answers 202 { ok: true }, stores a pending row and sends one confirm email', async () => {
    const res = await sub({ email: 'heir@example.com' });
    expect(res.status).toBe(202);
    expect(await bodyOf(res)).toEqual({ ok: true });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://atropyle.test');
    expect(await rows()).toEqual([{ email: 'heir@example.com', status: 'pending', lang: 'en' }]);
    expect(env.mailer.byKind('confirm')).toHaveLength(1);
    expect(env.mailer.sent[0].to).toBe('heir@example.com');
  });

  it('treats the same email in another case or with spaces as one subscription (review focus 1)', async () => {
    await sub({ email: ' Heir@Example.COM ' });
    await sub({ email: 'heir@example.com', lang: 'vi' }, { ip: '203.0.113.8' });
    expect(await rows()).toEqual([{ email: 'heir@example.com', status: 'pending', lang: 'vi' }]);
    const [first, second] = env.mailer.byKind('confirm');
    expect(first.to).toBe('heir@example.com');
    // The first link no longer works: the second request replaced its hash.
    const stale = await confirm(postJson('confirm', { token: tokenFrom(first, 'confirm') }), env.d);
    expect(stale.status).toBe(404);
    const ok = await confirm(postJson('confirm', { token: tokenFrom(second, 'confirm') }), env.d);
    expect(await bodyOf(ok)).toEqual({ ok: true, vault: VAULT, role: 'heir' });
    // Active now: the same answer, and no new email.
    const again = await sub({ email: 'HEIR@example.com' }, { ip: '203.0.113.9' });
    expect(again.status).toBe(202);
    expect(await bodyOf(again)).toEqual({ ok: true });
    expect(env.mailer.byKind('confirm')).toHaveLength(2);
    expect(await rows()).toEqual([{ email: 'heir@example.com', status: 'active', lang: 'vi' }]);
  });

  it('confirms once, sends one welcome email, and stays idempotent', async () => {
    await sub({ email: 'heir@example.com' });
    const token = tokenFrom(env.mailer.byKind('confirm')[0], 'confirm');
    expect((await confirm(postJson('confirm', { token }), env.d)).status).toBe(200);
    const twice = await confirm(postJson('confirm', { token }), env.d);
    expect(await bodyOf(twice)).toEqual({ ok: true, vault: VAULT, role: 'heir' });
    expect(env.mailer.byKind('welcome')).toHaveLength(1);
  });

  it('answers 404 TOKEN_INVALID for an unknown or malformed confirm token', async () => {
    for (const token of ['x'.repeat(43), 'short', 42]) {
      const res = await confirm(postJson('confirm', { token }), env.d);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toBe(PROBLEM);
      expect(await bodyOf(res)).toEqual({
        type: 'about:blank',
        title: expect.any(String),
        status: 404,
        code: 'TOKEN_INVALID',
      });
    }
  });

  it('pretends to accept a bot that fills the honeypot, and stores nothing', async () => {
    const res = await sub({ email: 'bot@example.com', website: 'https://spam.example' });
    expect(res.status).toBe(202);
    expect(await bodyOf(res)).toEqual({ ok: true });
    expect(await rows()).toEqual([]);
    expect(env.mailer.sent).toEqual([]);
  });

  it('rejects bad input with 400 INVALID_INPUT and a non-vault with 400 NOT_A_VAULT', async () => {
    for (const body of [
      { email: 'not-an-email' },
      { email: 'a@b.co', role: 'admin' },
      { email: 'a@b.co', lang: 'fr' },
      { email: 'a@b.co', vault: '0x12' },
    ]) {
      const res = await sub(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await bodyOf(res)).code).toBe('INVALID_INPUT');
    }
    const res = await sub({ email: 'a@b.co', vault: VAULT2 });
    expect(res.status).toBe(400);
    expect(await bodyOf(res)).toMatchObject({ code: 'NOT_A_VAULT', status: 400 });
  });

  it('limits 5 requests per hour per IP and 3 per hour per email, with Retry-After', async () => {
    for (let i = 0; i < 5; i++) expect((await sub({ email: `u${i}@example.com` })).status).toBe(202);
    const sixth = await sub({ email: 'u5@example.com' });
    expect(sixth.status).toBe(429);
    expect(await bodyOf(sixth)).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) {
      expect((await sub({ email: 'same@example.com' }, { ip: `198.51.100.${i}` })).status).toBe(202);
    }
    expect((await sub({ email: 'Same@Example.com' }, { ip: '198.51.100.9' })).status).toBe(429);
    const keys = await db.query<{ key: string }>('select key from public.rate_limits');
    for (const k of keys) expect(k.key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a POST from another origin', async () => {
    const res = await sub({ email: 'heir@example.com' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await rows()).toEqual([]);
  });

  it('unsubscribes with the JSON token or the RFC 8058 one-click POST, idempotently', async () => {
    const a = await activeSubscriber(db, { email: 'a@example.com', vault: VAULT, role: 'heir' });
    const b = await activeSubscriber(db, { email: 'b@example.com', vault: VAULT, role: 'owner' });
    const ta = await unsubToken(env.d.config.tokenSecret, a.id);
    const tb = await unsubToken(env.d.config.tokenSecret, b.id);
    const viaPage = await unsubscribe(postJson('unsubscribe', { token: ta }), env.d);
    expect(viaPage.status).toBe(200);
    expect(await bodyOf(viaPage)).toEqual({ ok: true });
    const oneClick = new Request(`${API}/unsubscribe?t=${tb}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect((await unsubscribe(oneClick, env.d)).status).toBe(200);
    expect(await rows()).toEqual([]);
    expect(await bodyOf(await unsubscribe(postJson('unsubscribe', { token: ta }), env.d))).toEqual({ ok: true });
    expect(await bodyOf(await unsubscribe(postJson('unsubscribe', { token: 'garbage' }), env.d))).toEqual({
      ok: true,
    });
    const missing = await unsubscribe(postJson('unsubscribe', {}), env.d);
    expect(missing.status).toBe(400);
  });

  it('accepts ordinary addresses and refuses broken ones', () => {
    for (const ok of ['a@b.co', 'first.last+tag@sub.example.org', 'x@xn--80ak6aa92e.com']) {
      expect(isEmail(ok), ok).toBe(true);
    }
    for (const bad of ['', 'a@b', '@b.co', 'a@@b.co', 'a b@c.co', 'a@b.co\n', '<a@b.co>', `${'a'.repeat(65)}@b.co`]) {
      expect(isEmail(bad), bad).toBe(false);
    }
  });
});
