// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('../../src/app/vault/', import.meta.url));
/** The same two patterns as lazy-boundary.test.ts (Quyết định 13). */
const GUARDED = /^(?:@atropyle\/sdk|viem)(?:\/|$)|(?:^|\/)impl(?:\/|$)/;
const STATEMENT = /^\s*(?:import|export)\b([^;]*?)\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

function valueImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(STATEMENT)) {
    const spec = m[2] ?? m[3];
    const typeOnly = m[2] !== undefined && /^\s*type\s/.test(m[1]);
    if (GUARDED.test(spec) && !typeOnly) out.push(spec);
  }
  return out;
}

describe('the /vault/ route', () => {
  it('imports the SDK, viem and impl/ only as types: they come with the lazy flows and chain chunks', () => {
    const files = readdirSync(DIR).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files).toContain('vault-page.tsx');
    expect(files).toContain('guest.tsx');
    const offenders = files.flatMap((f) => valueImports(readFileSync(join(DIR, f), 'utf8')).map((s) => `${f}: ${s}`));
    expect(offenders).toEqual([]);
  });

  it('catches a value import and lets a type import through', () => {
    expect(valueImports("import { stateName } from '@atropyle/sdk';")).toEqual(['@atropyle/sdk']);
    expect(valueImports("import { getAddress } from 'viem';")).toEqual(['viem']);
    expect(valueImports("import { transferRows } from '@/flows/impl/heir';")).toEqual(['@/flows/impl/heir']);
    expect(valueImports("import type { TransferRow } from '@/flows/impl/heir';")).toEqual([]);
  });
});
