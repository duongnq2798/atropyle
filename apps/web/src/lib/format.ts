import type { Lang } from '@/i18n/core';
import { formatDuration } from './duration';

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Truncates (never rounds up) to `maxFraction` digits. `decimals` null shows base units. */
export function formatAmount(raw: bigint, decimals: number | null, maxFraction = 6): string {
  const sign = raw < 0n ? '-' : '';
  const abs = raw < 0n ? -raw : raw;
  if (decimals === null || decimals === 0) return `${sign}${group(abs.toString())}`;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').slice(0, Math.max(0, maxFraction)).replace(/0+$/, '');
  if (abs > 0n && whole === 0n && frac === '') return maxFraction > 0 ? `<0.${'0'.repeat(maxFraction - 1)}1` : '<1';
  return `${sign}${group(whole.toString())}${frac ? `.${frac}` : ''}`;
}

export function formatBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

export function formatTimestamp(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/**
 * Time to, or since, a chain timestamp. The moment itself has come: it reads "0s ago", not "in 0s" (a check-in or a
 * release in the block just read, 7B-P1).
 */
export function formatRemaining(target: bigint, now: bigint): { past: boolean; text: string } {
  const past = target <= now;
  return { past, text: formatDuration(past ? now - target : target - now) };
}

/** Share of a held asset the vault can move today; null when the owner holds none. */
export function coveragePercent(coverage: bigint, held: bigint): number | null {
  if (held === 0n) return null;
  if (coverage >= held) return 100;
  return Number((coverage * 100n) / held);
}

/** Chain time "now": the block of the last read plus the wall clock since then. */
export function chainNow(blockTimestamp: bigint, fetchedAtMs: number, nowMs: number): bigint {
  return blockTimestamp + BigInt(Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000)));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * A calendar day, YYYY-MM-DD, as the site writes it: "22 Nov 2026" in English, "22/11/2026" in Vietnamese. No Intl:
 * the prerendered HTML and the browser must print the same text, whatever ICU data either has.
 */
export function formatDay(iso: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = m === null ? 0 : Number(m[2]);
  const day = m === null ? 0 : Number(m[3]);
  if (m === null || month < 1 || month > 12 || day < 1 || day > 31) throw new Error(`not a calendar day: ${iso}`);
  return lang === 'vi' ? `${m[3]}/${m[2]}/${m[1]}` : `${day} ${MONTHS[month - 1]} ${m[1]}`;
}
