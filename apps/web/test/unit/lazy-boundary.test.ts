// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
/** Modules that may reach a page's first bundle only as types (Quyết định 13). */
const GUARDED = /^(?:@atropyle\/sdk|viem)(?:\/|$)|(?:^|\/)impl(?:\/|$)/;
const STATEMENT = /^\s*(?:import|export)\b([^;]*?)\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

/** Route segment folders only: a route group `(name)` or a private folder `_name` can render `/` itself. */
const exempt = (rel: string) =>
  /(^|\/)impl\//.test(rel) || rel.startsWith('workers/') || /^app\/[^/(_][^/]*\//.test(rel);

/** Every runtime import of a guarded module in `source`. */
function runtimeImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(STATEMENT)) {
    const spec = m[2] ?? m[3];
    const typeOnly = m[2] !== undefined && /^\s*type\s/.test(m[1]);
    if (GUARDED.test(spec) && !typeOnly) out.push(spec);
  }
  return out;
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe('lazy boundary', () => {
  it('catches value imports and lets type imports through', () => {
    expect(runtimeImports("import { getAddress } from 'viem';")).toEqual(['viem']);
    expect(runtimeImports("import {\n  type A,\n  b,\n} from '@atropyle/sdk';")).toEqual(['@atropyle/sdk']);
    expect(runtimeImports("export { loadVault } from './impl/vault';")).toEqual(['./impl/vault']);
    expect(runtimeImports("import '@atropyle/sdk/verify';")).toEqual(['@atropyle/sdk/verify']);
    expect(runtimeImports("import type { Address } from 'viem';")).toEqual([]);
    expect(runtimeImports("export type { Sdk } from './impl/sdk';")).toEqual([]);
    expect(runtimeImports("const impl = await import('./impl');")).toEqual([]);
  });

  it('exempts route segment folders, not route groups or private folders, which can render /', () => {
    expect(exempt('app/e2e/worker/page.tsx')).toBe(true);
    expect(exempt('app/vault/page.tsx')).toBe(true);
    expect(exempt('app/(home)/page.tsx')).toBe(false);
    expect(exempt('app/_scenes/hero.tsx')).toBe(false);
    expect(exempt('app/page.tsx')).toBe(false);
    expect(exempt('chain/impl/vault.ts')).toBe(true);
  });

  it('no file outside impl/, workers/ and route folders imports the SDK, viem or impl at runtime', () => {
    const all = files(SRC).map((f) => relative(SRC, f).replaceAll('\\', '/'));
    const checked = all.filter((f) => !exempt(f));
    const offenders = checked.flatMap((f) =>
      runtimeImports(readFileSync(join(SRC, f), 'utf8')).map((spec) => `${f}: ${spec}`),
    );
    expect(offenders).toEqual([]);
    expect(checked).toContain('chain/hooks.ts');
    expect(checked.length).toBeGreaterThan(40);
  });
});
