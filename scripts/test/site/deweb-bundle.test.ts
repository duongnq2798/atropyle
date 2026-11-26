import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { SHARE, SHARE_IMAGE_URL } from '../../../apps/web/src/config/share';
import { type SiteTarget, webEnv } from '../../lib/site-build';
import { siteProblems } from '../../lib/site-check';
import { loadSite } from '../../lib/site-files';

// Builds the real web app for each site target. Needs `npm run build` at the root first (the web app imports the
// built SDK).
const WEB = fileURLToPath(new URL('../../../apps/web-legacy', import.meta.url));
const VITE_BIN = join(dirname(createRequire(join(WEB, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js');
const SENTINEL_HOST = 'health.atropyle.invalid';
const dirs: Record<SiteTarget, string> = { deweb: '', pages: '', vercel: '' };

function build(target: SiteTarget): void {
  const out = mkdtempSync(join(tmpdir(), `atropyle-${target}-`));
  dirs[target] = out;
  // The sentinel is set directly (not through webEnv) to prove vite.config itself drops it for DeWEB. vercel builds
  // as site:build does: vite.config folds it into pages, and only the share card tells the two apart.
  const env: NodeJS.ProcessEnv =
    target === 'vercel'
      ? webEnv('vercel', false, process.env)
      : { ...process.env, VITE_TARGET: target, VITE_CHAIN: 'xlayer', VITE_WORKER_URL: `https://${SENTINEL_HOST}` };
  env.WEB_OUT_DIR = out;
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

/** The Open Graph (`property`) and X (`name`) tags of a page, by key. */
function cardOf(dir: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [tag] of readFileSync(join(dir, 'index.html'), 'utf8').matchAll(/<meta\s[^>]*>/g)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const key = attrs.property ?? attrs.name;
    if (key && /^(og|twitter):/.test(key) && attrs.content !== undefined) tags.set(key, attrs.content);
  }
  return tags;
}

beforeAll(() => {
  build('deweb');
  build('pages');
  build('vercel');
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

test('the vercel bundle carries the large X card, with absolute https URLs and the image it links', () => {
  expect(Object.fromEntries(cardOf(dirs.vercel))).toEqual({
    'og:type': 'website',
    'og:site_name': 'Atropyle',
    'og:title': SHARE.title,
    'og:description': SHARE.description,
    'og:url': 'https://atropyle.xyz/',
    'og:image': SHARE_IMAGE_URL,
    'og:image:type': 'image/png',
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:image:alt': SHARE.image.alt,
    'twitter:card': 'summary_large_image',
    'twitter:title': SHARE.title,
    'twitter:description': SHARE.description,
    'twitter:image': SHARE_IMAGE_URL,
    'twitter:image:alt': SHARE.image.alt,
  });
  const image = readFileSync(join(dirs.vercel, SHARE.image.path));
  const source = new URL(`../../../apps/web/share/${SHARE.image.path}`, import.meta.url);
  expect(image.equals(readFileSync(source))).toBe(true);
});

test('the deweb and pages bundles carry the card text only: no URL, no image', () => {
  for (const target of ['deweb', 'pages'] as const) {
    const card = cardOf(dirs[target]);
    expect(card.get('og:title'), target).toBe(SHARE.title);
    expect(card.get('twitter:card'), target).toBe('summary');
    expect(
      [...card.values()].filter((v) => v.includes('://')),
      target,
    ).toEqual([]);
    expect(
      readdirSync(dirs[target]).filter((f) => /^og.*\.png$/.test(f)),
      target,
    ).toEqual([]);
  }
});
