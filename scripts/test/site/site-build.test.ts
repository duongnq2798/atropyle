import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { DOCS_BASE, docsEnv, outDirProblem, parseSiteArgs, webEnv, webOutOf } from '../../lib/site-build';

test('parseSiteArgs reads --target deweb or vercel, --no-docs and --out', () => {
  expect(parseSiteArgs(['--target', 'deweb'])).toEqual({ target: 'deweb', docs: true, dir: 'site-dist/deweb' });
  expect(parseSiteArgs(['--target=deweb', '--no-docs', '--out', 'tmp/site'])).toEqual({
    target: 'deweb',
    docs: false,
    dir: 'tmp/site',
  });
  expect(parseSiteArgs(['--target', 'vercel', '--no-docs'])).toEqual({
    target: 'vercel',
    docs: false,
    dir: 'site-dist/vercel',
  });
});

test('parseSiteArgs rejects a missing or unknown target, and says where Pages went', () => {
  expect(() => parseSiteArgs([])).toThrow('--target must be deweb or vercel');
  expect(() => parseSiteArgs(['--target', 'ipfs'])).toThrow('--target must be deweb or vercel');
  expect(() => parseSiteArgs(['--target', 'pages'])).toThrow('GitHub Pages is no longer built (spec §10)');
  expect(() => parseSiteArgs(['--target', 'deweb', '--out'])).toThrow('--out needs a value');
  expect(() => parseSiteArgs(['--target', 'deweb', '--yes'])).toThrow('unknown argument: --yes');
});

test('webEnv pins a mainnet build of the target and drops what must not reach it', () => {
  const base = {
    PATH: '/bin',
    NEXT_PUBLIC_TARGET: 'deweb',
    NEXT_PUBLIC_CHAIN: 'local',
    NEXT_PUBLIC_DEPLOYMENT: '{}',
    NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1',
    NEXT_PUBLIC_DOCS_PATH: '/docs/',
    ATROPYLE_E2E: '1',
  };
  expect(webEnv('deweb', false, base)).toEqual({
    PATH: '/bin',
    NEXT_PUBLIC_TARGET: 'deweb',
    NEXT_PUBLIC_CHAIN: 'xlayer',
  });
  expect(webEnv('deweb', true, { PATH: '/bin' })).toEqual({
    PATH: '/bin',
    NEXT_PUBLIC_TARGET: 'deweb',
    NEXT_PUBLIC_CHAIN: 'xlayer',
    NEXT_PUBLIC_DOCS_PATH: '/docs/',
  });
  // The production host keeps the backend URL of the Vercel project settings; its docs links stay absolute.
  expect(webEnv('vercel', true, base)).toEqual({
    PATH: '/bin',
    NEXT_PUBLIC_TARGET: 'vercel',
    NEXT_PUBLIC_CHAIN: 'xlayer',
    NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1',
  });
});

test('docsEnv sets DOCS_BASE per target', () => {
  expect(DOCS_BASE).toEqual({ deweb: '/docs/', vercel: '/docs/' });
  expect(docsEnv('deweb', { PATH: '/bin' })).toEqual({ PATH: '/bin', DOCS_BASE: '/docs/' });
});

test('outDirProblem refuses the repo root, its parents and the Next export', () => {
  const root = resolve('/work/atropyle');
  expect(webOutOf(root)).toBe(join(root, 'apps', 'web', 'out'));
  expect(outDirProblem(root, root)).toContain('repository root');
  expect(outDirProblem(resolve('/work'), root)).toContain('repository root');
  expect(outDirProblem(join(root, 'apps', 'web', 'out'), root)).toContain('apps/web/out');
  expect(outDirProblem(join(root, 'apps', 'web', 'out', 'x'), root)).toContain('apps/web/out');
  expect(outDirProblem(join(root, 'apps', 'web'), root)).toContain('apps/web/out');
  expect(outDirProblem(join(root, 'site-dist', 'deweb'), root)).toBeNull();
  expect(outDirProblem(resolve('/tmp/site'), root)).toBeNull();
});
