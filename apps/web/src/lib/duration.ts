/** Copy of formatDuration in packages/sdk/src/duration.ts (Quyết định 13; test/unit/sdk-copies.test.ts). */
export function formatDuration(seconds: number | bigint): string {
  let s = Number(seconds);
  if (s <= 0) return '0s';
  const parts: string[] = [];
  for (const [u, n] of [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ] as const) {
    const q = Math.floor(s / n);
    if (q > 0) {
      parts.push(`${q}${u}`);
      s -= q * n;
    }
  }
  return parts.slice(0, 2).join(' ');
}

const UNITS = [
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
] as const;

/** Intl's long unit names: English singular for exactly 1, Vietnamese one form; and each language's digit group. */
const WORDS = {
  en: { day: ['day', 'days'], hour: ['hour', 'hours'], minute: ['minute', 'minutes'], second: ['second', 'seconds'] },
  vi: { day: ['ngày', 'ngày'], hour: ['giờ', 'giờ'], minute: ['phút', 'phút'], second: ['giây', 'giây'] },
} as const;
const GROUP = { en: ',', vi: '.' } as const;

/**
 * A duration in words of the reader's language, for prose ("3 days", "3 ngày", "10 phút"), where formatDuration's
 * unit letters read like a log line. The largest unit the duration is a whole number of, so it is never rounded:
 * 36 hours stay "36 hours", not "1 day". The words are Intl's, written out (test/unit/duration-words.test.ts holds
 * them equal): the first Intl.NumberFormat of a page loads ICU's unit data, about 17 ms of main thread, and the kind
 * cards of /create/ asked for it while the page hydrated (7C-F1). Only a count that is not a whole number goes to Intl.
 */
export function durationWords(seconds: number | bigint, lang: 'en' | 'vi'): string {
  const s = Math.max(0, Number(seconds));
  const [unit, n] = UNITS.find(([, n]) => s > 0 && s % n === 0) ?? UNITS[3];
  const count = s / n;
  if (!Number.isSafeInteger(count)) {
    return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en', { style: 'unit', unit, unitDisplay: 'long' }).format(
      count,
    );
  }
  const [one, many] = WORDS[lang][unit];
  return `${String(count).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP[lang])} ${count === 1 ? one : many}`;
}
