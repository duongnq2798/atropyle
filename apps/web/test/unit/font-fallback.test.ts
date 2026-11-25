// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const require = createRequire(import.meta.url);

/** The part of a fontkit font that next/font reads. */
interface FontkitFont {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  glyphsForString(text: string): { advanceWidth: number; codePoints: number[] }[];
  hasGlyphForCodePoint(codePoint: number): boolean;
}

interface Overrides {
  ascentOverride: string;
  descentOverride: string;
  lineGapOverride: string;
  sizeAdjust: string;
}

// The fontkit build and the fallback helper that next/font/local runs on every font file (next 16.4.6).
const fontkit = require('next/dist/compiled/@next/font/dist/fontkit').default;
const openFont: (buffer: Buffer) => FontkitFont = fontkit.default ?? fontkit;
const { getFallbackMetricsFromFontFile } =
  require('next/dist/compiled/@next/font/dist/local/get-fallback-metrics-from-font-file') as {
    getFallbackMetricsFromFontFile(font: FontkitFont, category: string): Overrides & { fallbackFont: string };
  };
/** next's bundled capsize metrics of system fonts. */
const capsize: Record<
  string,
  { category: string; unitsPerEm: number; xWidthAvg: number; ascent: number; descent: number; lineGap: number }
> = require('next/dist/server/capsize-font-metrics.json');

interface Fallback {
  name: string;
  /** Average advance over next's sample string, in font units. */
  azAvgWidth: number;
  unitsPerEm: number;
}

// next's own fallback fonts (DEFAULT_SERIF_FONT, DEFAULT_SANS_SERIF_FONT); the test below proves they are its values.
const TIMES_NEW_ROMAN: Fallback = { name: 'Times New Roman', azAvgWidth: 854.3953488372093, unitsPerEm: 2048 };
const ARIAL: Fallback = { name: 'Arial', azAvgWidth: 934.5116279069767, unitsPerEm: 2048 };
// next/font knows no monospace fallback. Courier New is monospaced, so every glyph of next's sample string, spaces
// included, advances the same width: capsize's average width is that advance (1229 of 2048 units, 0.6 em).
const COURIER_NEW: Fallback = {
  name: 'Courier New',
  azAvgWidth: capsize.courierNew.xWidthAvg,
  unitsPerEm: capsize.courierNew.unitsPerEm,
};

/** next/font's calcAverageWidth: the mean advance over a sample of Latin text, letter frequency and spaces included. */
function averageWidth(font: FontkitFont): number | undefined {
  const sample = 'aaabcdeeeefghiijklmnnoopqrrssttuvwxyz      ';
  const glyphs = font.glyphsForString(sample);
  if (!glyphs.flatMap((g) => g.codePoints).every((cp) => font.hasGlyphForCodePoint(cp))) return undefined;
  return glyphs.reduce((sum, g) => sum + g.advanceWidth, 0) / glyphs.length;
}

/** getFallbackMetricsFromFontFile of next 16.4.6, with the fallback font as a parameter. */
function overrides(font: FontkitFont, fallback: Fallback): Overrides {
  const avg = averageWidth(font);
  const sizeAdjust = avg ? avg / font.unitsPerEm / (fallback.azAvgWidth / fallback.unitsPerEm) : 1;
  const pct = (v: number) => `${Math.abs(v * 100).toFixed(2)}%`;
  return {
    ascentOverride: pct(font.ascent / (font.unitsPerEm * sizeAdjust)),
    descentOverride: pct(font.descent / (font.unitsPerEm * sizeAdjust)),
    lineGapOverride: pct(font.lineGap / (font.unitsPerEm * sizeAdjust)),
    sizeAdjust: pct(sizeAdjust),
  };
}

const FACES = [
  { family: 'Atropyle Fraunces Fallback', file: 'fraunces-latin-standard-normal.woff2', fallback: TIMES_NEW_ROMAN },
  { family: 'Atropyle Inter Fallback', file: 'inter-latin-wght-normal.woff2', fallback: ARIAL },
  { family: 'Atropyle Mono Fallback', file: 'jetbrains-mono-latin-wght-normal.woff2', fallback: COURIER_NEW },
] as const;

/** Each fallback face, then its metric-compatible aliases (Liberation and the Chrome OS core fonts). */
const SOURCES: Record<string, string[]> = {
  'Atropyle Fraunces Fallback': ['Times New Roman', 'Liberation Serif', 'Tinos'],
  'Atropyle Inter Fallback': ['Arial', 'Liberation Sans', 'Arimo'],
  'Atropyle Mono Fallback': ['Courier New', 'Liberation Mono', 'Cousine'],
};

/** `0%` and `0.00%` are one value: a percentage as next formats it, two decimals; anything else stays as written. */
const twoDecimals = (v: string) => (/^\d+(\.\d+)?%$/.test(v) ? `${Number.parseFloat(v).toFixed(2)}%` : v);

/** The fallback @font-face rules of globals.css: their local() sources and their four overrides. */
function declaredFaces(): Map<string, Overrides & { src: string[] }> {
  const css = readFileSync(at('../../src/app/globals.css'), 'utf8');
  const out = new Map<string, Overrides & { src: string[] }>();
  for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const prop = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1].trim() ?? '';
    out.set(prop('font-family').replace(/["']/g, ''), {
      src: [...prop('src').matchAll(/local\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
      ascentOverride: twoDecimals(prop('ascent-override')),
      descentOverride: twoDecimals(prop('descent-override')),
      lineGapOverride: twoDecimals(prop('line-gap-override')),
      sizeAdjust: twoDecimals(prop('size-adjust')),
    });
  }
  return out;
}

const load = (file: string) => openFont(readFileSync(at(`../../src/fonts/files/${file}`)));

describe('metric-adjusted fallback faces', () => {
  it("computes the overrides as next/font does, with next's own fallback fonts", () => {
    const serif = load('fraunces-latin-standard-normal.woff2');
    const sans = load('inter-latin-wght-normal.woff2');
    const { fallbackFont: f1, ...nextSerif } = getFallbackMetricsFromFontFile(serif, 'serif');
    const { fallbackFont: f2, ...nextSans } = getFallbackMetricsFromFontFile(sans, 'sans-serif');
    expect([f1, f2]).toEqual([TIMES_NEW_ROMAN.name, ARIAL.name]);
    expect(overrides(serif, TIMES_NEW_ROMAN)).toEqual(nextSerif);
    expect(overrides(sans, ARIAL)).toEqual(nextSans);
    expect(capsize.courierNew.category).toBe('monospace');
  });

  for (const { family, file, fallback } of FACES) {
    it(`${family} carries the overrides of ${file} against ${fallback.name}`, () => {
      const face = declaredFaces().get(family);
      expect(face, family).toBeDefined();
      const { src, ...declared } = face ?? { src: [] };
      expect({ font: src[0], ...declared }).toEqual({ font: fallback.name, ...overrides(load(file), fallback) });
    });
  }

  it('lists metric-compatible aliases after each fallback font, for systems without it', () => {
    const faces = declaredFaces();
    for (const [family, names] of Object.entries(SOURCES)) {
      expect(faces.get(family)?.src, family).toEqual(names);
      // The aliases capsize knows share the base font's metrics, so the same overrides hold for them.
      const key = (name: string) =>
        name.replace(/ (\w)/g, (_, c: string) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());
      const base = capsize[key(names[0])];
      for (const alias of names.slice(1).filter((n) => key(n) in capsize)) {
        const m = capsize[key(alias)];
        expect([m.unitsPerEm, m.xWidthAvg, m.ascent, m.descent, m.lineGap], alias).toEqual([
          base.unitsPerEm,
          base.xWidthAvg,
          base.ascent,
          base.descent,
          base.lineGap,
        ]);
      }
    }
  });
});
