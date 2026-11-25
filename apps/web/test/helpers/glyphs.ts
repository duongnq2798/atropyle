import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FONT_FILES } from '../../src/fonts/ranges';

const require = createRequire(import.meta.url);
// The fontkit build that next/font/local runs on every font file (next 16.4.6), as test/unit/font-fallback.test.ts.
const fontkit = require('next/dist/compiled/@next/font/dist/fontkit').default;
const openFont: (buffer: Buffer) => { hasGlyphForCodePoint(codePoint: number): boolean } = fontkit.default ?? fontkit;

const FILES = fileURLToPath(new URL('../../src/fonts/files/', import.meta.url));

/** The three self-hosted families, each the union of its subset files. */
const FAMILIES = [...new Set(FONT_FILES.map((f) => f.pkg))].map((pkg) => ({
  pkg,
  fonts: FONT_FILES.filter((f) => f.pkg === pkg).map((f) => openFont(readFileSync(`${FILES}${f.file}`))),
}));

/**
 * The characters of `text` that some self-hosted family has no glyph for, as `U+2192 → (fraunces, inter)`. The browser
 * draws such a character in a system font: it looks foreign, and on Linux Chrome's first fallback lookup asks
 * fontconfig and blocks the main thread at first paint (the 7A CI Lighthouse run: TBT 826 ms for one `→`). Text can
 * be set in any of the three families, so a character must be in all of them. ASCII space and controls are skipped.
 */
export function missingGlyphs(text: string): string[] {
  const out: string[] = [];
  for (const ch of new Set(Array.from(text.normalize('NFC')))) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x20 || cp === 0x7f) continue;
    const missing = FAMILIES.filter((f) => !f.fonts.some((font) => font.hasGlyphForCodePoint(cp))).map((f) => f.pkg);
    if (missing.length > 0)
      out.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${ch} (${missing.join(', ')})`);
  }
  return out;
}

export const FAMILY_NAMES = FAMILIES.map((f) => f.pkg);
