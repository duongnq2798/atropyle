// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { messages as privacy } from '../../src/messages/privacy.messages';

const repo = (p: string) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');
const MIGRATION = repo('supabase/migrations/20261123000000_init.sql');
const SUBSCRIBE = repo('apps/backend/src/functions/subscribe.ts');
const SUBS = repo('apps/backend/src/store/subscriptions.ts');
const README = repo('apps/backend/README.md');
const MAILER = repo('apps/backend/src/mail/mailer.ts');
const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );

/** Every claim on /privacy/ is pinned to the backend code it describes: change one, and this test names the other. */
describe('the privacy page says what the backend does', () => {
  it('keeps only these columns for a sign-up', () => {
    const body = /create table public\.subscriptions \(([\s\S]*?)\n\);/.exec(MIGRATION)?.[1] ?? '';
    const columns = [...body.matchAll(/^\s+([a-z_]+)\s/gm)].map((m) => m[1]).filter((c) => c !== 'constraint');
    expect(columns).toEqual([
      'id',
      'email',
      'vault',
      'role',
      'lang',
      'status',
      'confirm_hash',
      'unsub_hash',
      'created_at',
      'confirmed_at',
    ]);
    for (const word of ['email', 'vault', 'role', 'language', 'confirmed']) expect(privacy.en.email1).toContain(word);
  });

  it('stores hashes of the link codes, never the codes', () => {
    expect(SUBSCRIBE).toContain('sha256Hex(token)');
    expect(SUBS).toContain('sha256Hex(await unsubToken(');
    expect(privacy.en.email2).toContain('only a hash');
  });

  it('deletes an unconfirmed sign-up after 48 hours and the abuse keys after 24 hours', () => {
    expect(MIGRATION).toMatch(
      /delete from public\.subscriptions where status = 'pending' and created_at < p_now - interval '48 hours'/,
    );
    expect(MIGRATION).toMatch(/delete from public\.rate_limits where window_start < p_now - interval '24 hours'/);
    expect(SUBSCRIBE).toMatch(/hmacHex\(d\.config\.tokenSecret, `ip:/);
    expect(SUBSCRIBE).toMatch(/hmacHex\(d\.config\.tokenSecret, `email:/);
    expect(privacy.en.email3).toContain('48 hours');
    expect(privacy.vi.email3).toContain('48 giờ');
    expect(privacy.en.email4).toContain('24 hours');
    expect(privacy.vi.email4).toContain('24 giờ');
  });

  it('deletes the sign-up and its delivery records when you stop alerts', () => {
    expect(SUBS).toContain('delete from public.subscriptions where unsub_hash');
    expect(MIGRATION).toMatch(
      /subscription_id bigint not null references public\.subscriptions \(id\) on delete cascade/,
    );
    expect(privacy.en.email6).toContain('deletes');
  });

  it('names where the data lives and who sends the mail', () => {
    expect(README).toContain('Southeast Asia (Singapore)');
    expect(MAILER).toContain('https://api.resend.com/emails');
    expect(privacy.en.email5).toContain('Singapore');
    expect(privacy.en.email5).toContain('Resend');
    expect(privacy.vi.email5).toContain('Singapore');
  });

  it('says /me/ reads only the chain, and no page asks the backend for your vaults', () => {
    const callers = walk(SRC)
      .map((f) => relative(SRC, f).replaceAll('\\', '/'))
      .filter((f) => f !== 'api/hooks.ts' && /\buseMe\(/.test(readFileSync(join(SRC, f), 'utf8')));
    expect(callers).toEqual([]);
    expect(privacy.en.me1).toContain('never asks the Atropyle backend');
  });
});
