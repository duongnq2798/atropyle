import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_SENTINEL, DOTENV_RPC_HOST, DOTENV_SENTINEL, outOf } from './paths';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Every file of a build whose bytes contain `needle`, relative to the build. */
function holders(target: 'vercel' | 'deweb', needle: string): string[] {
  const out = outOf(target);
  return files(out)
    .filter((f) => readFileSync(f).includes(needle))
    .map((f) => relative(out, f).replaceAll('\\', '/'));
}

describe('backend URL', () => {
  it('the deweb build never contains the API url', () => {
    // Both sentinels live under this host: the build environment's and the .env.production.local file's.
    expect(holders('deweb', 'atropyle.invalid')).toEqual([]);
  });

  it('the vercel build carries the URL of its build environment and ignores a .env file', () => {
    expect(holders('vercel', API_SENTINEL).length).toBeGreaterThan(0);
    expect(holders('vercel', DOTENV_SENTINEL)).toEqual([]);
  });
});

describe('deployment', () => {
  it('neither build takes a deployment from a .env file, whose RPC the page CSP would not allow', () => {
    // The deweb check above covers it too (same host); this one names the cause.
    for (const target of ['vercel', 'deweb'] as const) expect(holders(target, DOTENV_RPC_HOST), target).toEqual([]);
  });
});
