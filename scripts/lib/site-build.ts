import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

/**
 * deweb: the on-chain copy. pages: a GitHub Pages mirror under /atropyle/. vercel: the production host
 * (atropyle.xyz), at the root of its domain.
 */
export type SiteTarget = 'deweb' | 'pages' | 'vercel';
export const SITE_TARGETS: readonly SiteTarget[] = ['deweb', 'pages', 'vercel'];

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
  const known = SITE_TARGETS.find((t) => t === target);
  if (!known) throw new Error('--target must be deweb, pages or vercel');
  return { target: known, docs, dir: dir ?? `site-dist/${known}` };
}

/** Docs base path per target; the docs app reads it as process.env.DOCS_BASE (Plan 6). */
export const DOCS_BASE: Record<SiteTarget, string> = { deweb: '/docs/', pages: '/atropyle/docs/', vercel: '/docs/' };

/**
 * Site builds are always mainnet builds, and the DeWEB build never sees a Worker URL. The web app knows two targets,
 * deweb and an https host, so a vercel build is an https build (apps/web-legacy/build/csp.ts targetOf). It drops the
 * Worker URL and the Telegram bot as well: both were cut (web v2 spec, section 0.3), and a stray variable in the
 * Vercel project settings must not bring back a feature with nothing behind it.
 */
export function webEnv(target: SiteTarget, withDocs: boolean, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, VITE_TARGET: target, VITE_CHAIN: 'xlayer' };
  delete env.VITE_DEPLOYMENT;
  delete env.WEB_OUT_DIR;
  if (withDocs) env.VITE_DOCS_PATH = './docs/';
  else delete env.VITE_DOCS_PATH;
  if (target !== 'pages') delete env.VITE_WORKER_URL;
  if (target === 'vercel') delete env.VITE_TELEGRAM_BOT;
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
 * or the web build output, so a wrong `--out` cannot wipe the checkout.
 */
export function outDirProblem(out: string, root: string): string | null {
  const o = resolve(out);
  const webDist = join(root, 'apps', 'web-legacy', 'dist');
  if (contains(o, resolve(root)))
    return `--out ${o} is the repository root or one of its parents; refusing to delete it`;
  if (contains(o, webDist) || contains(webDist, o)) {
    return `--out ${o} overlaps apps/web-legacy/dist, which the build copies from; choose another directory`;
  }
  return null;
}
