import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { DOCS_BASE_URL } from '../../../packages/sdk/src/index';
import { SITE_PAGES, siteProblems, webPages } from '../../lib/site-check';
import { writeSiteDocs } from '../../lib/site-docs';

const NOT_FOUND = '<!doctype html><title>Not found</title>';
const ROUTE_PAGE = 'is missing: a page of ROUTES, which links from outside the site open';
const temps: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'atropyle-site-'));
  temps.push(d);
  return d;
};
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const put = (dir: string, path: string, text = '<!doctype html>') => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
/** Every page of the app and the 404 page, the way the Next export writes them: what both targets start from. */
function pagesSite(): string {
  const dir = temp();
  for (const p of SITE_PAGES) put(dir, p, p === '404.html' ? NOT_FOUND : '<!doctype html>');
  return dir;
}
/** A vercel folder the way site:build writes it: every page, and the docs. */
function vercelSite(): string {
  const dir = pagesSite();
  writeSiteDocs(dir);
  return dir;
}

test('webPages reads every route of ROUTES as a page of the export, and SITE_PAGES adds the 404 page', () => {
  expect(webPages()).toEqual([
    'index.html',
    'create/index.html',
    'vault/index.html',
    'verify/index.html',
    'sign/index.html',
    'proof/index.html',
    'me/index.html',
    'join/index.html',
    'alerts/confirm/index.html',
    'alerts/unsubscribe/index.html',
    'status/index.html',
    'developers/index.html',
    'privacy/index.html',
  ]);
  expect(SITE_PAGES).toEqual([...webPages(), '404.html']);
  expect(webPages("export const ROUTES = { home: '/', deep: '/a/b/' } as const;")).toEqual([
    'index.html',
    'a/b/index.html',
  ]);
  expect(() => webPages('export const PAGES = {};')).toThrow('apps/web/src/routes.ts: no ROUTES object');
});

test('siteProblems reports a missing index.html', () => {
  const dir = temp();
  for (const target of ['deweb', 'vercel'] as const) {
    expect(siteProblems(dir, target)).toEqual([
      `index.html is missing in ${dir.split(sep).join('/')}; run npm run site:build -- --target ${target}`,
    ]);
  }
});

test('siteProblems names every missing page of ROUTES and the 404 page, on both targets', () => {
  const dir = pagesSite();
  expect(siteProblems(dir, 'deweb')).toEqual([]);
  for (const p of ['verify/index.html', 'join/index.html', '404.html']) rmSync(join(dir, p));
  expect(siteProblems(dir, 'deweb')).toEqual([
    `verify/index.html ${ROUTE_PAGE}`,
    `join/index.html ${ROUTE_PAGE}`,
    '404.html is missing: the gateway serves it for every unknown path (deweb:publish sets it as the fallback)',
  ]);
  writeSiteDocs(dir);
  expect(siteProblems(dir, 'vercel')).toEqual([
    `verify/index.html ${ROUTE_PAGE}`,
    `join/index.html ${ROUTE_PAGE}`,
    '404.html is missing: Vercel serves it for every unknown path',
  ]);
});

test('siteProblems on deweb reports external references and every internal link the gateway would not serve as written', () => {
  const dir = pagesSite();
  put(
    dir,
    'index.html',
    '<img src="https://cdn.example/logo.png"><a href="/proof/">Proof</a><a href="/nowhere/">Nowhere</a>',
  );
  put(dir, 'status/index.html', '<a href="../">Home</a>');
  put(dir, 'docs/index.html', '<a href="guide">Guide</a>');
  expect(siteProblems(dir, 'deweb')).toEqual([
    'index.html: external reference https://cdn.example/logo.png (html) breaks the 100% on-chain badge',
    'docs/index.html: link docs/guide falls back to 404.html on the gateway',
    'index.html: link nowhere/index.html does not exist on the gateway',
  ]);
});

test('siteProblems on deweb without the page list (deweb:publish) keeps the gateway checks', () => {
  // deweb:publish publishes whatever folder it is given; the page list belongs to site:build and site:check.
  const dir = temp();
  put(dir, 'index.html', '<img src="https://cdn.example/logo.png"><a href="/nowhere/">Nowhere</a>');
  expect(siteProblems(dir, 'deweb', { pages: false })).toEqual([
    'index.html: external reference https://cdn.example/logo.png (html) breaks the 100% on-chain badge',
    'index.html: link nowhere/index.html does not exist on the gateway',
  ]);
  expect(siteProblems(dir, 'deweb').filter((p) => p.endsWith(ROUTE_PAGE))).toHaveLength(SITE_PAGES.length - 2);
});

test('siteProblems on vercel passes a folder with every page and the docs', () => {
  expect(siteProblems(vercelSite(), 'vercel')).toEqual([]);
});

test('siteProblems on vercel names each docs path the SDK, the CLI or a schema $id links to that is missing', () => {
  const dir = vercelSite();
  rmSync(join(dir, 'docs', 'index.html'));
  rmSync(join(dir, 'docs', 'schemas', 'error.json'));
  expect(siteProblems(dir, 'vercel')).toEqual([
    `docs/index.html is missing: the SDK, the CLI or a schema $id links to it under ${DOCS_BASE_URL}`,
    `docs/schemas/error.json is missing: the SDK, the CLI or a schema $id links to it under ${DOCS_BASE_URL}`,
  ]);
});

test('siteProblems on vercel names a missing error anchor, a missing page, and Vercel analytics', () => {
  const dir = vercelSite();
  put(dir, 'docs/reference/errors.html', '<section id="not_owner"></section>');
  rmSync(join(dir, 'alerts', 'confirm', 'index.html'));
  put(dir, 'index.html', '<script defer src="/_vercel/insights/script.js"></script>');
  const problems = siteProblems(dir, 'vercel');
  expect(problems).toContain(`alerts/confirm/index.html ${ROUTE_PAGE}`);
  expect(problems).toContain('docs/reference/errors.html has no anchor #not_guardian: errorDocsUrl links to it');
  expect(problems).not.toContain('docs/reference/errors.html has no anchor #not_owner: errorDocsUrl links to it');
  expect(problems).toContain(
    'index.html: loads from /_vercel/ (Vercel analytics or speed insights); the site runs no telemetry',
  );
});
