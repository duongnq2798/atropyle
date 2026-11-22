import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

export type SiteTarget = 'deweb' | 'pages';

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
  if (target !== 'deweb' && target !== 'pages') throw new Error('--target must be deweb or pages');
  return { target, docs, dir: dir ?? `site-dist/${target}` };
}

/** Docs base path per target; the docs app reads it as process.env.DOCS_BASE (Plan 6). */
export const DOCS_BASE: Record<SiteTarget, string> = { deweb: '/docs/', pages: '/atropyle/docs/' };

/** Site builds are always mainnet builds; the DeWEB build never sees a Worker URL. */
export function webEnv(target: SiteTarget, withDocs: boolean, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, VITE_TARGET: target, VITE_CHAIN: 'xlayer' };
  delete env.VITE_DEPLOYMENT;
  delete env.WEB_OUT_DIR;
  if (withDocs) env.VITE_DOCS_PATH = './docs/';
  else delete env.VITE_DOCS_PATH;
  if (target === 'deweb') delete env.VITE_WORKER_URL;
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
