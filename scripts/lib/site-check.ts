import { existsSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_BASE_URL } from '../../packages/sdk/src/index';
import { checkInternalLinks } from './gateway-path';
import { checkSite } from './onchain-check';
import type { SiteTarget } from './site-build';
import { errorAnchors, referencedDocsPaths } from './site-docs';
import { DEFAULT_FALLBACK, limitProblems, loadSite } from './site-files';

const ROUTES_TS = fileURLToPath(new URL('../../apps/web/src/routes.ts', import.meta.url));

/**
 * Every page of ROUTES (apps/web/src/routes.ts) as a file of the export: index.html, then <route>/index.html. Read from
 * the source text, because routes.ts imports through the app's @/ alias, which the scripts do not resolve.
 */
export function webPages(source: string = readFileSync(ROUTES_TS, 'utf8')): string[] {
  const block = /export const ROUTES = \{([^}]*)\}/.exec(source)?.[1] ?? '';
  const routes = [...block.matchAll(/:\s*'(\/[^']*)'/g)].map((m) => m[1]);
  if (!routes.includes('/')) throw new Error('apps/web/src/routes.ts: no ROUTES object with the home page "/"');
  return routes.map((r) => `${r.slice(1)}index.html`);
}

/**
 * Every page that links from outside the site open, on both targets: each page of ROUTES (deployment.webUrl and the
 * SDK's legacy `#/…` links land on index.html, the backend emails open /vault/ and /alerts/…, invites open /join/, the
 * printed letter's QR opens /verify/, the README and the share card open /proof/ and /verify/), and 404.html, which
 * Vercel and the DeWEB gateway serve for an unknown path.
 */
export const SITE_PAGES: readonly string[] = [...webPages(), DEFAULT_FALLBACK];

function pageProblems(dir: string, target: SiteTarget): string[] {
  const out: string[] = [];
  for (const p of SITE_PAGES) {
    if (existsSync(join(dir, p))) continue;
    if (p !== DEFAULT_FALLBACK) out.push(`${p} is missing: a page of ROUTES, which links from outside the site open`);
    else if (target === 'vercel') out.push(`${p} is missing: Vercel serves it for every unknown path`);
    else
      out.push(`${p} is missing: the gateway serves it for every unknown path (deweb:publish sets it as the fallback)`);
  }
  return out;
}

function vercelProblems(dir: string): string[] {
  const out = pageProblems(dir, 'vercel');
  for (const p of referencedDocsPaths()) {
    if (!existsSync(join(dir, p))) {
      out.push(`${p} is missing: the SDK, the CLI or a schema $id links to it under ${DOCS_BASE_URL}`);
    }
  }
  const errors = join(dir, 'docs', 'reference', 'errors.html');
  if (existsSync(errors)) {
    const html = readFileSync(errors, 'utf8');
    for (const a of errorAnchors()) {
      if (!html.includes(`id="${a}"`))
        out.push(`docs/reference/errors.html has no anchor #${a}: errorDocsUrl links to it`);
    }
  }
  const td = new TextDecoder('utf-8', { fatal: false });
  for (const f of loadSite(dir)) {
    if (/\.html?$/i.test(f.path) && td.decode(f.bytes).includes('/_vercel/')) {
      out.push(`${f.path}: loads from /_vercel/ (Vercel analytics or speed insights); the site runs no telemetry`);
    }
  }
  return out;
}

function dewebProblems(dir: string, pages: boolean): string[] {
  const files = loadSite(dir);
  const out = [...limitProblems(files), ...(pages ? pageProblems(dir, 'deweb') : [])];
  const report = checkSite(files);
  for (const f of report.external) {
    out.push(`${f.path}: external reference ${f.url} (${f.where}) breaks the 100% on-chain badge`);
  }
  for (const f of report.js) {
    out.push(
      `${f.path}: unknown host in JS: ${f.url}; if the page never requests it, add it to TEXT_ONLY_HOSTS with a reason`,
    );
  }
  // Every page, web and docs: with a 404 fallback, a broken link would quietly land on the 404 page.
  for (const l of checkInternalLinks(files, '', DEFAULT_FALLBACK)) {
    const why =
      l.problem === 'fallback' ? `falls back to ${DEFAULT_FALLBACK} on the gateway` : 'does not exist on the gateway';
    out.push(`${l.from}: link ${l.ref} ${why}`);
  }
  return out;
}

/**
 * What would break the site on its target. `pages: false` leaves out the list of pages (SITE_PAGES) on deweb, for
 * deweb:publish: it publishes whatever folder it is given, and site:build and site:check have already checked the pages
 * of the folder they wrote (7C-T12); the limits, the on-chain badge and the internal links still hold for any folder.
 */
export function siteProblems(dir: string, target: SiteTarget, o: { pages?: boolean } = {}): string[] {
  if (!existsSync(join(dir, 'index.html'))) {
    return [`index.html is missing in ${dir.split(sep).join('/')}; run npm run site:build -- --target ${target}`];
  }
  // Vercel serves the folder as it is, from the root of its domain; the headers come from the root vercel.json.
  return target === 'vercel' ? vercelProblems(dir) : dewebProblems(dir, o.pages ?? true);
}
