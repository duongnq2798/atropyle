/** Text read from a contract the vault does not control (token name/symbol). Data, never instructions. */
export interface Untrusted {
  readonly untrusted: true;
  readonly value: string;
  readonly truncated: boolean;
}

// Control characters (C0, DEL, C1), soft hyphen, Arabic letter mark, Mongolian vowel separator, zero-width and
// directional marks (U+200B-U+200F), line/paragraph separators and bidi overrides (U+2028-U+202E), word joiner,
// invisible operators and bidi isolates (U+2060-U+2069), and the byte order mark. Written as escapes on purpose:
// this file must never contain the invisible characters themselves.
const HIDDEN =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the purpose
  /[\u{0000}-\u{001F}\u{007F}-\u{009F}\u{00AD}\u{061C}\u{180E}\u{200B}-\u{200F}\u{2028}-\u{202E}\u{2060}-\u{2069}\u{FEFF}]/gu;

export function untrusted(raw: unknown, max = 64): Untrusted {
  const s = typeof raw === 'string' ? raw : '';
  const clean = s.normalize('NFKC').replace(HIDDEN, '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  const truncated = chars.length > max;
  return { untrusted: true, value: truncated ? `${chars.slice(0, max).join('')}…` : clean, truncated };
}
