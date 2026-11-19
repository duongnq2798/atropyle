/** Text read from a contract the vault does not control (token name/symbol). Data, never instructions. */
export interface Untrusted {
  readonly untrusted: true;
  readonly value: string;
  readonly truncated: boolean;
}

// Tabs, line feeds and every Unicode line break become a space before anything is stripped, so words that were
// separated by a line break stay apart. Written as escapes on purpose: this file must never contain the
// invisible characters themselves.
const LINE_BREAKS = /[\t\n\v\f\r\u{0085}\u{2028}\u{2029}]/gu;

// Everything that renders as nothing or can hide text from a reader:
// - by Unicode property: control characters (Cc), format characters (Cf: bidi marks and overrides, zero-width
//   characters, Unicode Tags U+E0000-U+E007F, soft hyphen, BOM), private use (Co), line and paragraph separators
//   (Zl, Zp), and Default_Ignorable_Code_Point (variation selectors, combining grapheme joiner, Hangul fillers);
// - pinned explicitly, so the result does not depend on the Unicode tables of the running engine: soft hyphen,
//   Arabic letter mark, Mongolian vowel separator, zero-width and directional marks (U+200B-U+200F), bidi
//   embeddings and overrides (U+202A-U+202E), word joiner, invisible operators and bidi isolates (U+2060-U+2069),
//   BOM, interlinear annotation anchors and the object replacement character (U+FFF9-U+FFFC), which is a symbol
//   and not covered by the properties, and the braille blank U+2800, also a symbol.
const HIDDEN =
  /[\p{Cc}\p{Cf}\p{Co}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u{00AD}\u{061C}\u{180E}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2069}\u{FEFF}\u{FFF9}-\u{FFFC}\u{2800}]/gu;

export function untrusted(raw: unknown, max = 64): Untrusted {
  const s = typeof raw === 'string' ? raw : '';
  const clean = s.normalize('NFKC').replace(LINE_BREAKS, ' ').replace(HIDDEN, '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  const truncated = chars.length > max;
  return { untrusted: true, value: truncated ? `${chars.slice(0, max).join('')}…` : clean, truncated };
}
