import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { DOCS_BASE, docsEnv, outDirProblem, parseSiteArgs, webEnv } from '../../lib/site-build';

test('parseSiteArgs reads target, --no-docs and --out', () => {
  expect(parseSiteArgs(['--target', 'deweb'])).toEqual({ target: 'deweb', docs: true, dir: 'site-dist/deweb' });
  expect(parseSiteArgs(['--target=pages', '--no-docs', '--out', 'tmp/site'])).toEqual({
    target: 'pages',
    docs: false,
    dir: 'tmp/site',
  });
  expect(parseSiteArgs(['--target', 'vercel', '--no-docs'])).toEqual({
    target: 'vercel',
    docs: false,
    dir: 'site-dist/vercel',
  });
});

test('parseSiteArgs rejects a missing or unknown target', () => {
  expect(() => parseSiteArgs([])).toThrow('--target must be deweb, pages or vercel');
  expect(() => parseSiteArgs(['--target', 'ipfs'])).toThrow('--target must be deweb, pages or vercel');
  expect(() => parseSiteArgs(['--target', 'deweb', '--out'])).toThrow('--out needs a value');
  expect(() => parseSiteArgs(['--target', 'deweb', '--yes'])).toThrow('unknown argument: --yes');
});

test('webEnv strips the Worker URL from DeWEB builds and pins mainnet', () => {
  const base = {
    PATH: '/bin',
    VITE_WORKER_URL: 'https://w.example',
    VITE_CHAIN: 'local',
    VITE_DEPLOYMENT: '{}',
    WEB_OUT_DIR: 'x',
    VITE_TELEGRAM_BOT: 'atropyle_bot',
  };
  expect(webEnv('deweb', true, base)).toEqual({
    PATH: '/bin',
    VITE_TARGET: 'deweb',
    VITE_CHAIN: 'xlayer',
    VITE_DOCS_PATH: './docs/',
    VITE_TELEGRAM_BOT: 'atropyle_bot',
  });
  expect(webEnv('pages', false, { VITE_WORKER_URL: 'https://w.example', VITE_DOCS_PATH: './docs/' })).toEqual({
    VITE_TARGET: 'pages',
    VITE_CHAIN: 'xlayer',
    VITE_WORKER_URL: 'https://w.example',
  });
  // The production host is an https build with neither the cut Worker nor the cut Telegram bot.
  expect(webEnv('vercel', false, base)).toEqual({ PATH: '/bin', VITE_TARGET: 'vercel', VITE_CHAIN: 'xlayer' });
});

test('docsEnv sets DOCS_BASE per target', () => {
  expect(DOCS_BASE).toEqual({ deweb: '/docs/', pages: '/atropyle/docs/', vercel: '/docs/' });
  expect(docsEnv('deweb', { PATH: '/bin' })).toEqual({ PATH: '/bin', DOCS_BASE: '/docs/' });
  expect(docsEnv('pages', {})).toEqual({ DOCS_BASE: '/atropyle/docs/' });
});

test('outDirProblem refuses the repo root, its parents and the web build output', () => {
  const root = resolve('/work/atropyle');
  expect(outDirProblem(root, root)).toContain('repository root');
  expect(outDirProblem(resolve('/work'), root)).toContain('repository root');
  expect(outDirProblem(join(root, 'apps', 'web-legacy', 'dist'), root)).toContain('apps/web-legacy/dist');
  expect(outDirProblem(join(root, 'apps', 'web-legacy', 'dist', 'x'), root)).toContain('apps/web-legacy/dist');
  expect(outDirProblem(join(root, 'apps', 'web-legacy'), root)).toContain('apps/web-legacy/dist');
  expect(outDirProblem(join(root, 'site-dist', 'deweb'), root)).toBeNull();
  expect(outDirProblem(resolve('/tmp/site'), root)).toBeNull();
});
