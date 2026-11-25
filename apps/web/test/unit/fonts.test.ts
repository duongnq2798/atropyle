// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_FILES, RANGES, SUBSETS } from '../../src/fonts/ranges';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Each `localFont({ ... })` call of src/fonts/index.ts, read as text so that line breaks do not matter. */
function calls(): { file: string; preload: boolean; range: string }[] {
  const src = readFileSync(at('../../src/fonts/index.ts'), 'utf8');
  return src
    .split('localFont({')
    .slice(1)
    .map((chunk) => ({
      file: /src:\s*'\.\/files\/([^']+)'/.exec(chunk)?.[1] ?? '',
      preload: /preload:\s*true/.test(chunk),
      range: /prop:\s*'unicode-range',\s*value:\s*'([^']+)'/.exec(chunk)?.[1] ?? '',
    }));
}

describe('self-hosted fonts', () => {
  it('ships the nine woff2 files byte for byte as Fontsource 5.3.0 publishes them', () => {
    for (const { file, pkg } of FONT_FILES) {
      const ours = at(`../../src/fonts/files/${file}`);
      const theirs = at(`../../../../node_modules/@fontsource-variable/${pkg}/files/${file}`);
      expect(existsSync(ours), file).toBe(true);
      expect(sha(ours), file).toBe(sha(theirs));
    }
  });

  it('ships the SIL Open Font License of each family', () => {
    for (const name of ['Fraunces', 'Inter', 'JetBrainsMono']) {
      const text = readFileSync(at(`../../public/licenses/fonts/OFL-${name}.txt`), 'utf8');
      expect(text, name).toMatch(/^Copyright/);
      expect(text, name).toContain('SIL Open Font License, Version 1.1');
    }
  });

  it('writes the same literal unicode ranges into every next/font call as ranges.ts', () => {
    const literals = calls().map((c) => c.range);
    expect(literals).toHaveLength(9);
    for (let i = 0; i < 9; i++) expect(literals[i], `call ${i}`).toBe(RANGES[SUBSETS[i % 3]]);
  });

  it('preloads only the Latin files of Fraunces and Inter', () => {
    const preloaded = calls()
      .filter((c) => c.preload)
      .map((c) => c.file);
    expect(preloaded).toEqual(['fraunces-latin-full-normal.woff2', 'inter-latin-wght-normal.woff2']);
  });
});
