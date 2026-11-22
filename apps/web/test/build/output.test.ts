import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outOf } from './paths';

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} build`, () => {
    const out = outOf(target);

    it('is a static site with a home page and a 404 page', () => {
      expect(existsSync(join(out, 'index.html'))).toBe(true);
      expect(existsSync(join(out, '404.html'))).toBe(true);
    });

    it('ships neither the dev gallery nor the e2e pages', () => {
      expect(existsSync(join(out, 'dev'))).toBe(false);
      expect(existsSync(join(out, 'e2e'))).toBe(false);
    });
  });
}
