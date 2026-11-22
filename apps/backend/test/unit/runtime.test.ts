import { getDeployment } from '@atropyle/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../../src/config';
import type { PgFactory, PgQueryable } from '../../src/db/postgres';
import type { Deps } from '../../src/deps';
import type { Mail } from '../../src/email/compose';
import { buildDeps, lazyHandler } from '../../src/entry/runtime';
import { KEEPER_KEY_INVALID } from '../../src/keeper/signer';
import { memoryLog } from '../../src/log';
import { RESEND_URL } from '../../src/mail/mailer';

const DB_URL = 'postgres://postgres.ref:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const BASE: Record<string, string> = {
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_DB_URL: DB_URL,
  SITE_URL: 'https://atropyle.test',
  MAIL_FROM: 'Atropyle <alerts@atropyle.test>',
  TOKEN_SECRET: 't'.repeat(32),
  CRON_SECRET: 'c'.repeat(32),
};

const envOf =
  (over: Record<string, string | undefined> = {}) =>
  (name: string): string | undefined =>
    ({ ...BASE, ...over })[name];

/** A postgres.js stand-in: buildDeps must not open a connection, only create the client. */
function fakePg() {
  const urls: string[] = [];
  const q: PgQueryable = { unsafe: async () => [] };
  const factory: PgFactory = (url) => {
    urls.push(url);
    return { ...q, begin: (fn) => fn(q), end: async () => {} };
  };
  return { factory, urls };
}

const MAIL: Mail = {
  from: 'Atropyle <alerts@atropyle.test>',
  to: 'reader@example.com',
  subject: 'Test',
  html: '<p>Test</p>',
  text: 'Test',
  headers: {},
  tags: [{ name: 'kind', value: 'welcome' }],
  idempotencyKey: 'k1',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildDeps (production wiring, spec §9.2)', () => {
  it('wires the database, the X Layer deployment and the settings from the secrets', () => {
    const pg = fakePg();
    const d = buildDeps(envOf(), { pg: pg.factory });
    expect(pg.urls).toEqual([DB_URL]);
    expect(d.chain.factoryBlock).toBe(getDeployment('xlayer').factoryBlock);
    expect(d.config).toMatchObject({
      siteUrl: 'https://atropyle.test',
      apiUrl: 'https://ref.supabase.co/functions/v1',
      rpcUrls: null,
    });
    expect(d.keeperError).toBeNull();
    const a = d.random(32);
    expect(a).toHaveLength(32);
    expect(d.random(32)).not.toEqual(a);
  });

  it('sends through Resend only when RESEND_API_KEY is set', async () => {
    await expect(buildDeps(envOf(), { pg: fakePg().factory }).mailer.send(MAIL)).rejects.toThrow(
      'RESEND_API_KEY is not set',
    );
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get('authorization') });
      return Response.json({ id: 'email-1' });
    });
    const d = buildDeps(envOf({ RESEND_API_KEY: 're_test_only' }), { pg: fakePg().factory });
    expect(await d.mailer.send(MAIL)).toEqual({ id: 'email-1' });
    expect(calls).toEqual([{ url: RESEND_URL, auth: 'Bearer re_test_only' }]);
  });

  it('refuses to start without its secrets and names each missing one', () => {
    let error: unknown;
    try {
      buildDeps(envOf({ SUPABASE_DB_URL: undefined, MAIL_FROM: undefined }), { pg: fakePg().factory });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).problems).toEqual(['MAIL_FROM is not set', 'SUPABASE_DB_URL is not set']);
  });

  it('keeps the keeper dry and records why when the keeper secret is not a key', () => {
    const d = buildDeps(envOf({ KEEPER_KEY: 'not-a-key' }), { pg: fakePg().factory });
    expect(d.keeperError).toBe(KEEPER_KEY_INVALID);
  });
});

describe('lazyHandler', () => {
  const req = () => new Request('https://ref.supabase.co/functions/v1/health');

  it('answers 500 while the secrets are missing, then builds on the next request once they are set', async () => {
    const log = memoryLog();
    const deps = { marker: 'deps' } as unknown as Deps;
    let ready = false;
    let builds = 0;
    const build = () => {
      builds++;
      if (!ready) throw new ConfigError(['SITE_URL is not set']);
      return deps;
    };
    const h = lazyHandler(async (_req, d) => Response.json({ same: d === deps }), envOf(), build, log);

    const first = await h(req());
    expect(first.status).toBe(500);
    expect(first.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(await first.json()).toEqual({
      type: 'about:blank',
      title: 'The service is not configured yet.',
      status: 500,
      code: 'INTERNAL',
    });
    expect(log.lines).toEqual([
      {
        level: 'error',
        msg: 'backend not configured',
        data: { error: 'The backend is not configured: SITE_URL is not set.' },
      },
    ]);

    ready = true;
    expect(await (await h(req())).json()).toEqual({ same: true });
    expect(await (await h(req())).json()).toEqual({ same: true });
    expect(builds).toBe(2);
  });

  it('logs which secret is wrong, never its value', async () => {
    const log = memoryLog();
    const pg = fakePg();
    const h = lazyHandler(
      async () => new Response('unreachable'),
      envOf({ TOKEN_SECRET: 'hunter2-short' }),
      (env) => buildDeps(env, { pg: pg.factory }),
      log,
    );
    expect((await h(req())).status).toBe(500);
    const logged = JSON.stringify(log.lines);
    expect(logged).toContain('TOKEN_SECRET must be at least 32 characters');
    expect(logged).not.toContain('hunter2');
    expect(pg.urls).toEqual([]);
  });
  it('never logs the database URL when the database client cannot be created', async () => {
    const log = memoryLog();
    const url = 'postgres://u:pw-secret@@@x';
    const factory: PgFactory = (u) => {
      throw new TypeError(`Invalid URL: ${u}`);
    };
    const h = lazyHandler(
      async () => new Response('unreachable'),
      envOf({ SUPABASE_DB_URL: url }),
      (env) => buildDeps(env, { pg: factory }),
      log,
    );
    const res = await h(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'The service is not configured yet.',
      status: 500,
      code: 'INTERNAL',
    });
    expect(JSON.stringify(log.lines)).not.toContain('pw-secret');
    expect(JSON.stringify(log.lines)).toContain('SUPABASE_DB_URL is not a valid database URL');
  });

  it('logs only the error name for an unexpected build failure', async () => {
    const log = memoryLog();
    const h = lazyHandler(
      async () => new Response('unreachable'),
      envOf(),
      () => {
        throw new RangeError('leaks pw-secret');
      },
      log,
    );
    expect((await h(req())).status).toBe(500);
    expect(log.lines).toEqual([{ level: 'error', msg: 'backend could not be built', data: { error: 'RangeError' } }]);
  });
});
