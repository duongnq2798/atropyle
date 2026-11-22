import { describe, expect, it } from 'vitest';
import { clientIp, HttpError, json, readJson, route } from '../../src/http';
import { memoryLog } from '../../src/log';

const SITE = 'https://atropyle.test';
const deps = () => ({ config: { allowedOrigins: [SITE] }, log: memoryLog() });
const post = (headers: Record<string, string> = {}, body = '{}') =>
  new Request('https://ref.supabase.co/functions/v1/x', { method: 'POST', headers, body });

describe('route', () => {
  const ok = route({ method: 'POST', cors: 'site' }, async () => json({ ok: true }));

  it('answers a preflight from the site with its origin', async () => {
    const r = await ok(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: SITE } }), deps());
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(r.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(r.headers.get('access-control-allow-headers')).toBe('content-type');
  });

  it('refuses a POST from another origin with 403 UNAUTHORIZED', async () => {
    const r = await ok(post({ origin: 'https://evil.test' }), deps());
    expect(r.status).toBe(403);
    expect(r.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(await r.json()).toEqual({
      type: 'about:blank',
      title: 'Origin not allowed.',
      status: 403,
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts a POST without an Origin header (mail clients, pg_net, curl)', async () => {
    const r = await ok(post(), deps());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('lets a foreign origin POST when strictOrigin is false', async () => {
    const open = route({ method: 'POST', cors: 'site', strictOrigin: false }, async () => json({ ok: true }));
    expect((await open(post({ origin: 'https://mail.example' }), deps())).status).toBe(200);
  });

  it('opens a public GET to every origin', async () => {
    const get = route({ method: 'GET', cors: 'public' }, async () => json({ n: 1n }));
    const r = await get(new Request('https://x/f', { headers: { origin: 'https://anyone.test' } }), deps());
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(await r.text()).toBe('{"n":"1"}');
  });

  it('answers a wrong method with 405 INVALID_INPUT and an Allow header', async () => {
    const r = await ok(new Request('https://x/f'), deps());
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('POST, OPTIONS');
    expect((await r.json()).code).toBe('INVALID_INPUT');
  });

  it('turns an HttpError into problem+json and keeps its headers', async () => {
    const limited = route({ method: 'POST', cors: 'site' }, async () => {
      throw new HttpError(429, 'RATE_LIMITED', 'Too many requests.', { 'retry-after': '60' });
    });
    const r = await limited(post({ origin: SITE }), deps());
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(r.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(await r.json()).toEqual({
      type: 'about:blank',
      title: 'Too many requests.',
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('hides an unexpected error behind 500 INTERNAL and logs it', async () => {
    const d = deps();
    const boom = route({ method: 'POST', cors: 'none' }, async () => {
      throw new Error('db down');
    });
    const r = await boom(post(), d);
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('INTERNAL');
    expect(d.log.lines).toEqual([
      { level: 'error', msg: 'handler failed', data: { path: '/functions/v1/x', error: 'db down' } },
    ]);
  });
});

describe('readJson and clientIp', () => {
  it('reads a JSON object and refuses anything else', async () => {
    expect(await readJson(post({}, '{"a":1}'))).toEqual({ a: 1 });
    await expect(readJson(post({}, 'not json'))).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' });
    await expect(readJson(post({}, '[1]'))).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' });
    await expect(readJson(post({}, `{"a":"${'x'.repeat(5000)}"}`))).rejects.toMatchObject({ status: 400 });
  });

  it('takes the first x-forwarded-for entry', () => {
    expect(clientIp(post({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(post({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(post())).toBe('unknown');
  });
});
