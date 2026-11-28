import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

/**
 * vercel: the production host (atropyle.xyz), at the root of its domain; the root vercel.json builds it. deweb: the
 * on-chain copy. Both are the static export of apps/web. GitHub Pages is no longer built (spec §10).
 */
export type SiteTarget = 'deweb' | 'vercel';
export const SITE_TARGETS: readonly SiteTarget[] = ['deweb', 'vercel'];

export interface SiteArgs {
  target: SiteTarget;
  docs: boolean;
  dir: string;
}

export function parseSiteArgs(argv: readonly string[]): SiteArgs {
  let target: string | undefined;
  let docs = true;
  let dir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--target') target = value();
    else if (a.startsWith('--target=')) target = a.slice('--target='.length);
    else if (a === '--no-docs') docs = false;
    else if (a === '--out') dir = value();
    else throw new Error(`unknown argument: ${a}`);
  }
  if (target === 'pages') {
    throw new Error('--target pages: GitHub Pages is no longer built (spec §10); the site is on Vercel and DeWEB');
  }
  const known = SITE_TARGETS.find((t) => t === target);
  if (!known) throw new Error('--target must be deweb or vercel');
  return { target: known, docs, dir: dir ?? `site-dist/${known}` };
}

/** Docs base path per target; the docs app reads it as process.env.DOCS_BASE (Plan 6). */
export const DOCS_BASE: Record<SiteTarget, string> = { deweb: '/docs/', vercel: '/docs/' };

/** Where `next build` writes the static export (OUT_DIR of apps/web/scripts/lib/run-next.ts). */
export const webOutOf = (root: string): string => join(root, 'apps', 'web', 'out');

/**
 * Site builds are mainnet builds of their target, and the variables of a dev or e2e build never reach them. DeWEB never
 * sees the backend URL (apps/web/scripts/lib/build-env.ts blanks it again). Vercel keeps NEXT_PUBLIC_API_URL from the
 * project settings and sets no docs path: its docs links stay absolute at DOCS_BASE_URL, which is this same host, so
 * the production bundle is the vercel bundle that test:build checks and size measures (7C-T12 Ruling 6).
 */
export function webEnv(target: SiteTarget, withDocs: boolean, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, NEXT_PUBLIC_TARGET: target, NEXT_PUBLIC_CHAIN: 'xlayer' };
  for (const key of ['NEXT_PUBLIC_DEPLOYMENT', 'NEXT_PUBLIC_DOCS_PATH', 'ATROPYLE_E2E']) delete env[key];
  if (target === 'deweb') {
    delete env.NEXT_PUBLIC_API_URL;
    if (withDocs) env.NEXT_PUBLIC_DOCS_PATH = DOCS_BASE.deweb;
  }
  return env;
}

export function docsEnv(target: SiteTarget, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...base, DOCS_BASE: DOCS_BASE[target] };
}

export function hasDocsWorkspace(root: string): boolean {
  return existsSync(join(root, 'apps', 'docs', 'package.json'));
}

const contains = (outer: string, inner: string) => {
  const r = relative(outer, inner);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

/**
 * `site:build` deletes the output directory first. Refuse one that is, contains or lies inside the repo root
 * or the Next export, so a wrong `--out` cannot wipe the checkout.
 */
export function outDirProblem(out: string, root: string): string | null {
  const o = resolve(out);
  const webOut = webOutOf(root);
  if (contains(o, resolve(root))) {
    return `--out ${o} is the repository root or one of its parents; refusing to delete it`;
  }
  if (contains(o, webOut) || contains(webOut, o)) {
    return `--out ${o} overlaps apps/web/out, which the build copies from; choose another directory`;
  }
  return null;
}
