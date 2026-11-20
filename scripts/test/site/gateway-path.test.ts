import { expect, test } from 'vitest';
import {
  checkInternalLinks,
  normalizeGatewayPath,
  resolveGatewayPath,
  resolveNormalized,
} from '../../lib/gateway-path';
import { collectReferences } from '../../lib/onchain-check';
import { makeSiteFile } from '../../lib/site-files';

const file = (path: string, text = '') => makeSiteFile(path, new TextEncoder().encode(text));

test('normalizeGatewayPath follows the gateway rules', () => {
  expect(normalizeGatewayPath('/')).toBe('index.html');
  expect(normalizeGatewayPath('')).toBe('index.html');
  expect(normalizeGatewayPath('/docs//guide/?q=1#top')).toBe('docs/guide/index.html');
  expect(normalizeGatewayPath('/docs/caf%C3%A9.html')).toBe('docs/caf\u{E9}.html');
  expect(normalizeGatewayPath('/docs/caf\u{E9}.html')).toBe('docs/caf\u{E9}.html');
  expect(normalizeGatewayPath('/bad%E0%A4%A')).toBeNull();
});

test('resolveGatewayPath tries exact, then index.html, then the fallback', () => {
  const files = new Set(['index.html', 'docs/index.html', 'docs/guide.html', 'docs/api/index.html', 'assets/a.js']);
  expect(resolveGatewayPath(files, 'index.html', '/docs/guide.html')).toEqual({
    kind: 'exact',
    path: 'docs/guide.html',
  });
  expect(resolveGatewayPath(files, 'index.html', '/docs/api')).toEqual({ kind: 'index', path: 'docs/api/index.html' });
  // No ".html" is added: a Starlight link without the extension lands on the web app.
  expect(resolveGatewayPath(files, 'index.html', '/docs/guide')).toEqual({ kind: 'fallback', path: 'index.html' });
  expect(resolveGatewayPath(files, 'index.html', '/docs/missing.css')).toBeNull();
  expect(resolveGatewayPath(files, null, '/docs/guide')).toBeNull();
});

test('checkInternalLinks reports links that hit the fallback or 404', () => {
  const files = [
    file('index.html', '<script src="./missing.js"></script>'),
    file(
      'docs/index.html',
      '<a href="guide">Guide</a><a href="api/">API</a><link rel="stylesheet" href="/docs/_astro/x.css"><a href="./guide.html">ok</a>',
    ),
    file('docs/guide.html'),
    file('docs/api/index.html'),
  ];
  expect(checkInternalLinks(files, 'docs/', 'index.html')).toEqual([
    { from: 'docs/index.html', ref: 'docs/guide', problem: 'fallback' },
    { from: 'docs/index.html', ref: 'docs/_astro/x.css', problem: 'missing' },
  ]);
});

test('Starlight file-format links resolve exactly', () => {
  const files = [
    file('index.html'),
    file(
      'docs/index.html',
      '<a href="/docs/errors.html#not_owner">e</a><a href="/docs/sdk.html">s</a><a href="/docs/">home</a>',
    ),
    file('docs/errors.html'),
    file('docs/sdk.html'),
  ];
  expect(checkInternalLinks(files, 'docs/', 'index.html')).toEqual([]);
});

const BS = String.fromCharCode(92);
const SITE = ['index.html', 'docs/index.html', 'docs/guide.html', 'assets/a.js'];

test('traversal-like gateway paths never resolve outside the site set', () => {
  const set = new Set(SITE);
  const raws = [
    '/..',
    '/../index.html',
    '/docs/../../etc/passwd',
    '/%2e%2e/%2e%2e/secret',
    '/%2E%2E%2Findex.html',
    `/docs${BS}..${BS}secret`,
    `${BS}${BS}server${BS}share`,
    '//docs//guide.html',
    '/docs/guide.html%00.png',
    '/docs/\0guide',
    '/%00',
  ];
  for (const raw of raws) {
    const r = resolveGatewayPath(set, 'index.html', raw);
    if (r !== null) expect(set.has(r.path), `${JSON.stringify(raw)} -> ${r.path}`).toBe(true);
  }
  expect(resolveGatewayPath(set, 'index.html', '/..')).toBeNull();
  expect(resolveGatewayPath(set, 'index.html', '/%2e%2e')).toBeNull();
  expect(resolveGatewayPath(set, 'index.html', '//docs//guide.html')).toEqual({
    kind: 'exact',
    path: 'docs/guide.html',
  });
});

test('traversal-like refs in checkInternalLinks stay inside the site set', () => {
  const refs = [
    '../../../etc/passwd',
    '%2e%2e/%2e%2e/x.css',
    '..%2f..%2fx',
    `${BS}${BS}host${BS}x.js`,
    '//host/x.js',
    'a%00b',
  ];
  const html = refs.map((r) => `<a href="${r}">x</a>`).join('');
  const files = [file('index.html'), file('docs/index.html', html)];
  const problems = checkInternalLinks(files, 'docs/', 'index.html');
  for (const p of problems) expect(p.ref.startsWith('/')).toBe(false);
  // A ref with leftover ".." segments is only a literal key to the gateway: it matches no file, never one outside.
  const set = new Set(files.map((f) => f.path));
  for (const ref of collectReferences(html, 'html', 'docs/')) {
    const r = resolveNormalized(set, 'index.html', ref);
    if (r !== null) expect(set.has(r.path)).toBe(true);
    expect(set.has(ref)).toBe(false);
  }
  expect(() => checkInternalLinks(files, 'docs/', null)).not.toThrow();
});
