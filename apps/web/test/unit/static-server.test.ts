// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStaticServer } from '../../scripts/lib/static-server';

describe('static server', () => {
  const root = mkdtempSync(join(tmpdir(), 'atropyle-static-'));
  let server: Awaited<ReturnType<typeof startStaticServer>>;

  beforeAll(async () => {
    writeFileSync(join(root, 'index.html'), '<p>home</p>');
    writeFileSync(join(root, '404.html'), '<p>missing</p>');
    mkdirSync(join(root, 'proof'));
    writeFileSync(join(root, 'proof', 'index.html'), '<p>proof</p>');
    writeFileSync(join(root, 'font.woff2'), 'x');
    server = await startStaticServer(root, 0, { 'content-security-policy': "default-src 'self'" });
  });
  afterAll(() => server.close());

  it('serves directory index pages with and without the trailing slash', async () => {
    expect(await (await fetch(`${server.url}/`)).text()).toBe('<p>home</p>');
    expect(await (await fetch(`${server.url}/proof/`)).text()).toBe('<p>proof</p>');
    expect(await (await fetch(`${server.url}/proof`)).text()).toBe('<p>proof</p>');
  });

  it('answers 404 with the 404 page', async () => {
    const r = await fetch(`${server.url}/nope/`);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('<p>missing</p>');
  });

  it('sends the extra headers and the right content types', async () => {
    const r = await fetch(`${server.url}/font.woff2`);
    expect(r.headers.get('content-type')).toBe('font/woff2');
    expect(r.headers.get('content-security-policy')).toBe("default-src 'self'");
  });

  it('gzips text when the client accepts it, as Vercel does, and leaves compressed formats alone', async () => {
    const page = await fetch(`${server.url}/proof/`, { headers: { 'accept-encoding': 'gzip, br' } });
    expect(page.headers.get('content-encoding')).toBe('gzip');
    expect(page.headers.get('vary')).toBe('accept-encoding');
    expect(await page.text()).toBe('<p>proof</p>');
    const plain = await fetch(`${server.url}/proof/`, { headers: { 'accept-encoding': 'identity' } });
    expect(plain.headers.get('content-encoding')).toBeNull();
    expect(await plain.text()).toBe('<p>proof</p>');
    const font = await fetch(`${server.url}/font.woff2`, { headers: { 'accept-encoding': 'gzip' } });
    expect(font.headers.get('content-encoding')).toBeNull();
  });

  it('never serves a file outside the root', async () => {
    const r = await fetch(`${server.url}/..%2f..%2fetc%2fpasswd`);
    expect([403, 404]).toContain(r.status);
  });
});
