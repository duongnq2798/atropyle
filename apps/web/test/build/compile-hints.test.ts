import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHUNKS_DIR, COMPILE_HINT, noModuleScripts } from '../../scripts/lib/compile-hints';
import { outOf } from './paths';

function files(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path, ext);
    return e.name.endsWith(ext) ? [path] : [];
  });
}

/** The startup task of `/` is mostly lazy compile without the hint (scripts/lib/compile-hints.ts). */
describe.each(['vercel', 'deweb'] as const)('the V8 compile hint in the %s build', (target) => {
  const out = outOf(target);
  const url = (file: string) => `/${relative(out, file).split(sep).join('/')}`;
  const polyfills = new Set(files(out, '.html').flatMap((p) => noModuleScripts(readFileSync(p, 'utf8'))));
  const chunks = files(join(out, CHUNKS_DIR), '.js');

  it('starts every chunk a module browser loads', () => {
    const modern = chunks.filter((f) => !polyfills.has(url(f)));
    expect(modern.length).toBeGreaterThan(10);
    for (const f of modern) expect(readFileSync(f, 'utf8').startsWith(COMPILE_HINT), url(f)).toBe(true);
  });

  it('leaves out the noModule polyfills, which every page names by a path that exists', () => {
    for (const src of polyfills) {
      const f = chunks.find((c) => url(c) === src);
      expect(f, src).toBeDefined();
      expect(readFileSync(f as string, 'utf8').startsWith(COMPILE_HINT), src).toBe(false);
    }
  });
});
