import type { Lang } from '@/i18n/core';

/** Units of a rough duration, largest first; a month is 30 days and a year 365, as people count ahead. */
const ROUGH = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
] as const;

/**
 * A duration the way people say one ahead of time ("in 6 months", "in 18 minutes"): the largest unit it holds at
 * least two of, rounded. The time machine talks about the future in these words; terms that must be exact (a
 * window, a period) keep durationWords. Intl spells the unit, so it costs no messages.
 */
export function roughDuration(seconds: number | bigint, lang: Lang): string {
  const s = Math.max(0, Number(seconds));
  const [unit, n] = ROUGH.find(([, n]) => s >= 2 * n) ?? ROUGH[ROUGH.length - 1];
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en', { style: 'unit', unit, unitDisplay: 'long' }).format(
    Math.round(s / n),
  );
}

/**
 * A chain time as a date in UTC: chain time has no zone, and a local date would change between the reader's
 * machine, the prerender and the tests. With `withTime`, the time of day too, marked UTC (a Drill's moments are
 * minutes apart).
 */
export function chainDate(ts: bigint, lang: Lang, withTime: boolean): string {
  const d = new Date(Number(ts) * 1000);
  const locale = lang === 'vi' ? 'vi-VN' : 'en-GB';
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
  if (!withTime) return date;
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return `${date}, ${time} UTC`;
}

/** The `dateTime` of a `<time>` for a chain time. */
export function isoDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toISOString();
}
