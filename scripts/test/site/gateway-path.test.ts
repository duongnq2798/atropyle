import { expect, test } from 'vitest';
import { checkInternalLinks, normalizeGatewayPath, resolveGatewayPath } from '../../lib/gateway-path';
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
