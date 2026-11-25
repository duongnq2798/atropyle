// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_FILES, RANGES, SUBSETS } from '../../src/fonts/ranges';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const require = createRequire(import.meta.url);

/** The part of a fontkit font these tests read. */
interface FontkitFont {
  variationAxes: Record<string, { min: number; max: number }>;
  post: { isFixedPitch: number };
  glyphsForString(s: string): { advanceWidth: number }[];
  /** The advance variations along the axes: one delta set per glyph, each over the regions it names. */
  HVAR?: { itemVariationStore: { itemVariationData: { regionIndexCount: number }[] } };
}

// The fontkit build that next/font/local runs on every font file (next 16.4.6), as in font-fallback.test.ts.
const fontkit = require('next/dist/compiled/@next/font/dist/fontkit').default;
const openFont: (buffer: Buffer) => FontkitFont = fontkit.default ?? fontkit;

/**
 * Spec §18.4.2 Task 1: the standard Fraunces files of Fontsource 5.3.0, wght and opsz only. The full ones also
 * carried SOFT and WONK and weighed 121 016, 105 244 and 34 308 bytes; the Latin file is the LCP preload.
 */
const FRAUNCES: Record<string, { bytes: number; sha256: string }> = {
  'fraunces-vietnamese-standard-normal.woff2': {
    bytes: 19_700,
    sha256: 'f18853f63a870ebef013e30e789d8d544f102e4acd94988e57c223d9c796ddf4',
  },
  'fraunces-latin-ext-standard-normal.woff2': {
    bytes: 59_388,
    sha256: 'a2930b27d13a228bd9ab6a49269b5f800237892ad560cb9dd7fab01b1620f88e',
  },
  'fraunces-latin-standard-normal.woff2': {
    bytes: 67_304,
    sha256: '7234ed860a9cc83045413c4faee63c960a8f2d1917adcf728119307d56e0d783',
  },
};

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

  it('ships the standard Fraunces files: their sizes, their SHA-256, and only the wght and opsz axes', () => {
    for (const [file, pin] of Object.entries(FRAUNCES)) {
      const buffer = readFileSync(at(`../../src/fonts/files/${file}`));
      expect(buffer.byteLength, file).toBe(pin.bytes);
      expect(createHash('sha256').update(buffer).digest('hex'), file).toBe(pin.sha256);
      const axes = openFont(buffer).variationAxes;
      expect(Object.keys(axes).sort(), file).toEqual(['opsz', 'wght']);
      expect([axes.wght?.min, axes.wght?.max], file).toEqual([100, 900]);
      expect([axes.opsz?.min, axes.opsz?.max], file).toEqual([9, 144]);
    }
    expect(FONT_FILES.filter((f) => f.pkg === 'fraunces').map((f) => f.file)).toEqual(Object.keys(FRAUNCES));
    // No full file is left behind: it would ship unused and keep the SOFT and WONK axes in reach.
    expect(readdirSync(at('../../src/fonts/files/')).filter((f) => f.includes('-full-'))).toEqual([]);
  });

  it('draws JetBrains Mono at one advance over its whole wght axis, 100 to 800, so the 650 capitals of Address move nothing', () => {
    const f = openFont(readFileSync(at('../../src/fonts/files/jetbrains-mono-latin-wght-normal.woff2')));
    // 650 is a real instance of the variable file, not a faux bold.
    expect(Object.keys(f.variationAxes)).toEqual(['wght']);
    expect([f.variationAxes.wght.min, f.variationAxes.wght.max]).toEqual([100, 800]);
    expect(f.post.isFixedPitch).not.toBe(0);
    // The advances of the default instance (400): every hex digit and both cases of A to F, 600 of 1000 units.
    expect([...new Set(f.glyphsForString('0x0123456789abcdefABCDEF').map((g) => g.advanceWidth))]).toEqual([600]);
    // Along the axis, HVAR moves each advance by the deltas of the regions its delta sets name. The one set of this
    // file names none, so no weight moves an advance (the standard Fraunces Latin file, whose advances follow wght
    // and opsz, names 3 in each of its four). fontkit's getVariation() throws on this WOFF2 file, so the instance at
    // 650 is not read here; test 1 of e2e/wallet.spec.ts measures it in Chromium.
    expect(f.HVAR?.itemVariationStore.itemVariationData.map((d) => d.regionIndexCount)).toEqual([0]);
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
    expect(preloaded).toEqual(['fraunces-latin-standard-normal.woff2', 'inter-latin-wght-normal.woff2']);
  });
});
