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

/**
 * A duration in words of the reader's language, for prose ("3 days", "3 ngày", "10 phút"), where formatDuration's
 * unit letters read like a log line. The largest unit the duration is a whole number of, so it is never rounded:
 * 36 hours stay "36 hours", not "1 day". Intl spells the unit, so it costs no messages.
 */
export function durationWords(seconds: number | bigint, lang: 'en' | 'vi'): string {
  const s = Math.max(0, Number(seconds));
  const [unit, n] = UNITS.find(([, n]) => s > 0 && s % n === 0) ?? UNITS[3];
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en', { style: 'unit', unit, unitDisplay: 'long' }).format(
    s / n,
  );
}
