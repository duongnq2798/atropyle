import { stringify } from '@atropyle/sdk';
import { type Sql, toIso } from '../db/sql';

export const CURSOR = 'logs';

export async function getCursor(sql: Sql, name = CURSOR): Promise<bigint | null> {
  const rows = await sql.query<{ block: string }>(
    'select block::text as block from public.cursors where name = $1::text',
    [name],
  );
  return rows.length === 0 ? null : BigInt(rows[0].block);
}

export async function setCursor(sql: Sql, block: bigint, nowIso: string, name = CURSOR): Promise<void> {
  await sql.query(
    `insert into public.cursors (name, block, updated_at) values ($1::text, $2::bigint, $3::timestamptz)
     on conflict (name) do update set block = excluded.block, updated_at = excluded.updated_at`,
    [name, block.toString(), nowIso],
  );
}

export async function getMeta<T = unknown>(sql: Sql, key: string): Promise<{ value: T; updatedAt: string } | null> {
  const rows = await sql.query<{ value: T; updated_at: unknown }>(
    'select value, updated_at from public.meta where key = $1::text',
    [key],
  );
  return rows.length === 0 ? null : { value: rows[0].value, updatedAt: toIso(rows[0].updated_at) };
}

/** `value` goes through the SDK's stringify, so bigints are stored as decimal strings. */
export async function setMeta(sql: Sql, key: string, value: unknown, nowIso: string): Promise<void> {
  await sql.query(
    `insert into public.meta (key, value, updated_at) values ($1::text, $2::jsonb, $3::timestamptz)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    [key, stringify(value), nowIso],
  );
}

/**
 * Takes `key` until nowMs + ttlMs unless another holder's lease is still running. The TTL outlives the tick budget,
 * so a run that died without releasing blocks the next runs for at most ttlMs.
 */
export async function tryLease(sql: Sql, key: string, nowMs: number, ttlMs: number): Promise<boolean> {
  const rows = await sql.query(
    `insert into public.meta (key, value, updated_at)
     values ($1::text, jsonb_build_object('until', $2::text), $3::timestamptz)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
       where (public.meta.value ->> 'until')::timestamptz <= $3::timestamptz
     returning 1 as taken`,
    [key, new Date(nowMs + ttlMs).toISOString(), new Date(nowMs).toISOString()],
  );
  return rows.length > 0;
}

export async function releaseLease(sql: Sql, key: string): Promise<void> {
  await sql.query('delete from public.meta where key = $1::text', [key]);
}
