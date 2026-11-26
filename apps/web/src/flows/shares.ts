import type { HeirRow } from './impl/create-form';

/** Shares are basis points: 10 000 is everything. The splitter moves them in whole percents. */
export const TOTAL_BPS = 10_000;
export const MIN_BPS = 100;
export const BPS_STEP = 100;

/** Equal whole percents; the leftover percents go to the first heirs (3 heirs: 34/33/33). */
export function evenSplit(n: number): number[] {
  if (n <= 0) return [];
  const units = TOTAL_BPS / BPS_STEP;
  const base = Math.floor(units / n);
  const extra = units - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) * BPS_STEP);
}

/** The n − 1 cut points between neighbours, as running sums: the splitter's thumbs. */
export function boundaries(shares: readonly number[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < shares.length - 1; i++) {
    sum += shares[i] ?? 0;
    out.push(sum);
  }
  return out;
}

export function fromBoundaries(b: readonly number[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const x of b) {
    out.push(x - prev);
    prev = x;
  }
  out.push(TOTAL_BPS - prev);
  return out;
}

/**
 * Any thumb positions (crossed, out of range, off the grid) to the nearest valid ones: on the 1% grid, in order, at
 * least 1% apart and 1% from both ends. Forward pass lifts, backward pass lowers; with at most 99 cuts both fit.
 */
export function normalizeBoundaries(b: readonly number[]): number[] {
  const v = b.map((x) => Math.round(x / BPS_STEP) * BPS_STEP).sort((x, y) => x - y);
  const n = v.length;
  for (let i = 0; i < n; i++) v[i] = Math.max(v[i] ?? 0, (i === 0 ? 0 : (v[i - 1] ?? 0)) + MIN_BPS);
  for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i] ?? 0, (i === n - 1 ? TOTAL_BPS : (v[i + 1] ?? 0)) - MIN_BPS);
  return v;
}

/** A typed share for heir i: the difference goes to the next heir (the one before, for the last), never below 1%. */
export function setShare(shares: readonly number[], i: number, bps: number): number[] {
  const n = shares.length;
  if (n < 2 || i < 0 || i >= n || !Number.isFinite(bps)) return [...shares];
  const j = i === n - 1 ? i - 1 : i + 1;
  const pool = (shares[i] ?? 0) + (shares[j] ?? 0);
  const want = Math.round(bps / BPS_STEP) * BPS_STEP;
  const next = Math.min(Math.max(want, MIN_BPS), pool - MIN_BPS);
  const out = [...shares];
  out[i] = next;
  out[j] = pool - next;
  return out;
}

/** The rows' percents as bps when they already form a full split (a vault's own 33.33/33.33/33.34 stays exact). */
export function sharesOf(rows: readonly HeirRow[]): number[] {
  const n = rows.length;
  if (n <= 1) return n === 1 ? [TOTAL_BPS] : [];
  const bps = rows.map((r) => Math.round(Number(r.percent.trim()) * 100));
  const whole = bps.every((b) => Number.isInteger(b) && b >= 1);
  return whole && bps.reduce((a, b) => a + b, 0) === TOTAL_BPS ? bps : evenSplit(n);
}

/** The inverse of sharesOf; a single heir keeps an empty percent like heirRows does. */
export function withShares(rows: readonly HeirRow[], shares: readonly number[]): HeirRow[] {
  return rows.map((r, i) => ({ ...r, percent: rows.length === 1 ? '' : String((shares[i] ?? 0) / 100) }));
}
