import type { Sql } from '../db/sql';

export const HOUR_MS = 3_600_000;

/** Counts one request against `key` in its fixed one-hour window and returns the count so far (spec §9.2). */
export async function hit(sql: Sql, key: string, nowMs: number): Promise<number> {
  const windowStart = new Date(Math.floor(nowMs / HOUR_MS) * HOUR_MS).toISOString();
  const rows = await sql.query<{ count: number }>(
    `insert into public.rate_limits (key, window_start, count) values ($1::text, $2::timestamptz, 1)
     on conflict (key, window_start) do update set count = public.rate_limits.count + 1
     returning count`,
    [key, windowStart],
  );
  return rows[0].count;
}

/** Seconds until the current window ends: the Retry-After of a 429. */
export function retryAfterSeconds(nowMs: number): number {
  return Math.ceil((HOUR_MS - (nowMs % HOUR_MS)) / 1000);
}
