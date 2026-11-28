import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outOf } from './paths';

/** Folders named `__next.*`: what a Windows export makes of a nested route's prefetch file. */
function segmentFolders(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (!e.isDirectory()) return [];
    const path = join(dir, e.name);
    return e.name.startsWith('__next.') ? [relative(root, path)] : segmentFolders(root, path);
  });
}

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} build`, () => {
    const out = outOf(target);

    it('is a static site with a home page and a 404 page', () => {
      expect(existsSync(join(out, 'index.html'))).toBe(true);
      expect(existsSync(join(out, '404.html'))).toBe(true);
    });

    it('ships no dev-only and no e2e-only pages', () => {
      expect(existsSync(join(out, 'dev'))).toBe(false);
      expect(existsSync(join(out, 'e2e'))).toBe(false);
    });

    it('writes the prefetch file of /proof/ under the flat name the router asks for, on every OS (segments.ts)', () => {
      expect(existsSync(join(out, 'proof', '__next.proof.__PAGE__.txt'))).toBe(true);
      expect(segmentFolders(out)).toEqual([]);
    });
  });
}
