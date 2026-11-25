import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FONT_FILES, RANGES, SUBSETS, type Subset } from '../../src/fonts/ranges';

const require = createRequire(import.meta.url);
// The fontkit build that next/font/local runs on every font file (next 16.4.6), as test/unit/font-fallback.test.ts.
const fontkit = require('next/dist/compiled/@next/font/dist/fontkit').default;
const openFont: (buffer: Buffer) => { hasGlyphForCodePoint(codePoint: number): boolean } = fontkit.default ?? fontkit;

const FILES = fileURLToPath(new URL('../../src/fonts/files/', import.meta.url));

/** `U+0000-00FF,U+0131` as [start, end] pairs. */
const parse = (value: string): [number, number][] =>
  value.split(',').map((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, '').split('-');
    return [Number.parseInt(a, 16), Number.parseInt(b ?? a, 16)];
  });

/** The subset a file serves, from its name (`inter-latin-ext-wght-normal.woff2` is latin-ext). */
function subsetOf(file: string): Subset {
  const found = [...SUBSETS].sort((x, y) => y.length - x.length).find((s) => file.includes(`-${s}-`));
  if (found === undefined) throw new Error(`no subset in the font file name ${file}`);
  return found;
}

/** The three self-hosted families: each face is a subset file and the unicode-range it is declared with. */
const FAMILIES = [...new Set(FONT_FILES.map((f) => f.pkg))].map((pkg) => ({
  pkg,
  faces: FONT_FILES.filter((f) => f.pkg === pkg).map((f) => ({
    font: openFont(readFileSync(`${FILES}${f.file}`)),
    ranges: parse(RANGES[subsetOf(f.file)]),
  })),
}));

const draws = (face: (typeof FAMILIES)[number]['faces'][number], cp: number) =>
  face.ranges.some(([a, b]) => cp >= a && cp <= b) && face.font.hasGlyphForCodePoint(cp);

/**
 * The characters of `text` that some self-hosted family cannot draw, as `U+2192 → (fraunces, inter)`. The browser
 * draws such a character in a system font, which looks foreign next to the self-hosted faces. A face draws a code
 * point only inside its unicode-range, so a family counts only a glyph of a file whose subset range covers it. Text
 * can be set in any of the three families, so a character must be in all of them. ASCII space and controls are
 * skipped.
 */
export function missingGlyphs(text: string): string[] {
  const out: string[] = [];
  for (const ch of new Set(Array.from(text.normalize('NFC')))) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x20 || cp === 0x7f) continue;
    const missing = FAMILIES.filter((f) => !f.faces.some((face) => draws(face, cp))).map((f) => f.pkg);
    if (missing.length > 0)
      out.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${ch} (${missing.join(', ')})`);
  }
  return out;
}

export const FAMILY_NAMES = FAMILIES.map((f) => f.pkg);
