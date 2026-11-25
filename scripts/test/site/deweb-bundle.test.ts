import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { SiteTarget } from '../../lib/site-build';
import { siteProblems } from '../../lib/site-check';
import { loadSite } from '../../lib/site-files';

// Builds the real web app twice. Needs `npm run build` at the root first (the web app imports the built SDK).
const WEB = fileURLToPath(new URL('../../../apps/web-legacy', import.meta.url));
const VITE_BIN = join(dirname(createRequire(join(WEB, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js');
const SENTINEL_HOST = 'health.atropyle.invalid';
const dirs: Record<SiteTarget, string> = { deweb: '', pages: '' };

function build(target: SiteTarget): void {
  const out = mkdtempSync(join(tmpdir(), `atropyle-${target}-`));
  dirs[target] = out;
  // The sentinel is set directly (not through webEnv) to prove vite.config itself drops it for DeWEB.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VITE_TARGET: target,
    VITE_CHAIN: 'xlayer',
    VITE_WORKER_URL: `https://${SENTINEL_HOST}`,
    WEB_OUT_DIR: out,
  };
  delete env.VITE_DEPLOYMENT;
  delete env.VITE_DOCS_PATH;
  // Run vite's own entry with this Node: no shell, so no DEP0190 and no .cmd lookup on Windows.
  const r = spawnSync(process.execPath, [VITE_BIN, 'build'], { cwd: WEB, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`vite build (${target}) failed:\n${r.error ?? ''}\n${r.stdout}\n${r.stderr}`);
}

function filesWithSentinel(dir: string): string[] {
  const td = new TextDecoder();
  return loadSite(dir)
    .filter((f) => td.decode(f.bytes).includes(SENTINEL_HOST))
    .map((f) => f.path);
}

beforeAll(() => {
  build('deweb');
  build('pages');
});

afterAll(() => {
  for (const d of Object.values(dirs)) if (d) rmSync(d, { recursive: true, force: true });
});

test('the pages bundle carries the worker url (control)', () => {
  expect(filesWithSentinel(dirs.pages).length).toBeGreaterThan(0);
});

test('the deweb bundle never contains the worker url', () => {
  expect(filesWithSentinel(dirs.deweb)).toEqual([]);
});

test('the deweb bundle passes the on-chain check', () => {
  expect(siteProblems(dirs.deweb, 'deweb')).toEqual([]);
});
