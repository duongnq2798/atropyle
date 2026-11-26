// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('../../src/app/create/', import.meta.url));
/** Every file /create/ loads before the flow and finish chunks. */
const FIRST_LOAD = [
  'page.tsx',
  'wizard.tsx',
  'steps.tsx',
  'preview.tsx',
  'progress.tsx',
  'use-wizard.ts',
  'kind.ts',
  'finish-chunk.ts',
];
/** The same statement pattern as lazy-boundary.test.ts. */
const STATEMENT = /^\s*(?:import|export)\b([^;]*?)\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
const GUARDED = /^(?:@atropyle\/sdk|viem)(?:\/|$)|^@\/flows\/impl(?:\/|$)|^\.\/(?:review|done|finish)$/;

function valueImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(STATEMENT)) {
    const spec = m[2] ?? m[3];
    const typeOnly = m[2] !== undefined && /^\s*type\s/.test(m[1]);
    if (GUARDED.test(spec) && !typeOnly) out.push(spec);
  }
  return out;
}

describe('the first load of /create/', () => {
  it('the pattern catches value imports and lets types through', () => {
    expect(valueImports("import { ReviewStep } from './review';")).toEqual(['./review']);
    expect(valueImports("import type { Prepared } from './review';")).toEqual([]);
    expect(valueImports("import type * as Finish from './finish';")).toEqual([]);
    expect(valueImports("import { loomOf } from '@/flows/impl/loom';")).toEqual(['@/flows/impl/loom']);
    expect(valueImports("const f = await import('./finish');")).toEqual([]);
  });

  it.each(FIRST_LOAD)('%s imports the SDK, viem, impl and the finish chunk only as types', (file) => {
    expect(valueImports(readFileSync(DIR + file, 'utf8'))).toEqual([]);
  });
});
