// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
/**
 * What the chunk of "Ask X Layer" must never load (spec §18.4.3 Task 5′: no SDK and no viem in the page; R9). The
 * chunk lives in impl/, which lazy-boundary.test.ts lets import them, so this test walks its imports itself.
 */
const BANNED = /^(?:@atropyle\/(?:sdk|circuits)|viem)(?:\/|$)/;
/** It re-exports chain/impl/sdk.ts: rpcPlan imported through it would pull the SDK into the chunk (R9). */
const INDEX = 'chain/impl/index.ts';
const STATEMENT = /^\s*(?:import|export)\b([^;]*?)\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

/** The src/ file that `spec`, imported by the src/ file `from`, names; null for a package or a stylesheet. */
function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/')
    ? spec.slice(2)
    : spec.startsWith('.')
      ? posix.join(posix.dirname(from), spec)
      : null;
  if (base === null || base.endsWith('.css')) return null;
  const file = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((f) =>
    existsSync(join(SRC, f)),
  );
  if (file === undefined) throw new Error(`${from}: cannot resolve ${spec}`);
  return file;
}

/** Every src/ file and package that `entry` loads at run time, through static imports and re-exports; types skipped. */
function reach(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const m of readFileSync(join(SRC, file), 'utf8').matchAll(STATEMENT)) {
      if (m[2] !== undefined && /^\s*type\s/.test(m[1])) continue;
      const spec = m[2] ?? m[3];
      const into = resolve(file, spec);
      if (into === null) packages.add(spec);
      else queue.push(into);
    }
  }
  return { files: [...files].sort(), packages: [...packages].sort() };
}

describe('the chunk of "Ask X Layer" (R9, Review Focus 1)', () => {
  it('is walked through static imports and re-exports, types skipped: the index would bring the SDK', () => {
    const index = reach(INDEX);
    expect(index.files).toContain('chain/impl/sdk.ts');
    expect(index.packages).toContain('@atropyle/sdk');
    // rpc.ts loads nothing at run time: Deployment was a type, and RpcSource is its own (Step 3).
    expect(reach('chain/impl/rpc.ts')).toEqual({ files: ['chain/impl/rpc.ts'], packages: [] });
  });

  it('loads no SDK, no circuits, no viem and not the chain/impl index: the generated calls and rpc.ts only', () => {
    const { files, packages } = reach('home/impl/ask-view.tsx');
    expect(files).toEqual(expect.arrayContaining(['home/impl/ask.ts', 'home/impl/ask-calls.ts', 'chain/impl/rpc.ts']));
    expect(files.filter((f) => f.startsWith('chain/impl/') && f !== 'chain/impl/rpc.ts')).toEqual([]);
    expect(packages.filter((p) => BANNED.test(p))).toEqual([]);
  });

  it('asks rpcPlan of chain/impl/rpc.ts directly, never through the index', () => {
    const ask = readFileSync(join(SRC, 'home/impl/ask.ts'), 'utf8');
    expect(ask).toContain("from '@/chain/impl/rpc';");
    expect(ask).not.toMatch(/from ['"]@\/chain\/impl['"]/);
  });
});
