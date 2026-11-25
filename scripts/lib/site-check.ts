import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { checkInternalLinks } from './gateway-path';
import { checkSite } from './onchain-check';
import type { SiteTarget } from './site-build';
import { limitProblems, loadSite } from './site-files';

export function siteProblems(dir: string, target: SiteTarget): string[] {
  if (!existsSync(join(dir, 'index.html'))) {
    return [`index.html is missing in ${dir.split(sep).join('/')}; run npm run site:build -- --target ${target}`];
  }
  if (target === 'pages') {
    return existsSync(join(dir, '.nojekyll')) ? [] : ['.nojekyll is missing (GitHub Pages would hide _astro/)'];
  }
  // Vercel serves the folder as it is, from the root of its domain; the headers come from the root vercel.json.
  // DOCS_BASE_URL points there, so the error reference must be in the folder too.
  if (target === 'vercel') {
    return existsSync(join(dir, 'docs', 'reference', 'errors.html'))
      ? []
      : ['docs/reference/errors.html is missing: the docsUrl of every SDK error points there'];
  }
  const files = loadSite(dir);
  const out = limitProblems(files);
  const report = checkSite(files);
  for (const f of report.external) {
    out.push(`${f.path}: external reference ${f.url} (${f.where}) breaks the 100% on-chain badge`);
  }
  for (const f of report.js) {
    out.push(
      `${f.path}: unknown host in JS: ${f.url}; if the page never requests it, add it to TEXT_ONLY_HOSTS with a reason`,
    );
  }
  if (files.some((f) => f.path === 'docs/index.html')) {
    for (const l of checkInternalLinks(files, 'docs/', 'index.html')) {
      out.push(
        `${l.from}: link ${l.ref} ${l.problem === 'fallback' ? 'falls back to index.html on the gateway' : 'does not exist on the gateway'}`,
      );
    }
  }
  return out;
}
