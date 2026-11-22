import { type Address, getAddress } from 'viem';
import { sha256Hex, unsubToken } from '../crypto';
import type { Sql } from '../db/sql';
import type { Lang, Role } from '../types';

export interface Subscriber {
  id: string;
  email: string;
  lang: Lang;
  role: Role;
  vault: Address;
}

export type UpsertResult = { status: 'pending'; id: string } | { status: 'active' };

export interface SubscriberRow {
  id: string;
  email: string;
  lang: Lang;
  role: Role;
  vault: string;
}

export const toSubscriber = (r: SubscriberRow): Subscriber => ({
  id: r.id,
  email: r.email,
  lang: r.lang,
  role: r.role,
  vault: getAddress(r.vault),
});

/**
 * Creates or refreshes the pending row of (email, vault, role) with a new confirm hash. An active row is left as it
 * is and the caller sends nothing; the HTTP answer is the same either way (spec §9.6). email is citext, so the
 * unique constraint ignores case; the handler also trims and lowercases it.
 */
export async function upsertPending(
  sql: Sql,
  o: {
    email: string;
    vault: Address;
    role: Role;
    lang: Lang;
    confirmHash: string;
    tokenSecret: string;
    nowIso: string;
  },
): Promise<UpsertResult> {
  return sql.begin(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into public.subscriptions (email, vault, role, lang, confirm_hash, created_at)
       values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::timestamptz)
       on conflict (email, vault, role) do update
         set confirm_hash = excluded.confirm_hash, lang = excluded.lang, created_at = excluded.created_at
         where public.subscriptions.status = 'pending'
       returning id::text as id`,
      [o.email, o.vault.toLowerCase(), o.role, o.lang, o.confirmHash, o.nowIso],
    );
    if (rows.length === 0) return { status: 'active' };
    const id = rows[0].id;
    const unsubHash = await sha256Hex(await unsubToken(o.tokenSecret, id));
    await tx.query(
      'update public.subscriptions set unsub_hash = $2::text where id = $1::bigint and unsub_hash is null',
      [id, unsubHash],
    );
    return { status: 'pending', id };
  });
}

/** Activates the row whose confirm hash matches. `was` tells the caller whether this is the first confirmation. */
export async function confirmByHash(
  sql: Sql,
  hash: string,
  nowIso: string,
): Promise<(Subscriber & { was: 'pending' | 'active' }) | null> {
  const rows = await sql.query<SubscriberRow & { was: 'pending' | 'active' }>(
    `with prev as (
       select id, status from public.subscriptions where confirm_hash = $1::text order by id limit 1 for update
     )
     update public.subscriptions s
        set status = 'active', confirmed_at = coalesce(s.confirmed_at, $2::timestamptz)
       from prev
      where s.id = prev.id
     returning s.id::text as id, s.email::text as email, s.lang, s.role, s.vault, prev.status as was`,
    [hash, nowIso],
  );
  return rows.length === 0 ? null : { ...toSubscriber(rows[0]), was: rows[0].was };
}

/** Unsubscribing deletes the row (spec §9.5); its deliveries go with it (on delete cascade). */
export async function deleteByUnsubHash(sql: Sql, hash: string): Promise<number> {
  const rows = await sql.query('delete from public.subscriptions where unsub_hash = $1::text returning id', [hash]);
  return rows.length;
}

export async function activeSubscribers(sql: Sql, vault: Address): Promise<Subscriber[]> {
  const rows = await sql.query<SubscriberRow>(
    `select id::text as id, email::text as email, lang, role, vault from public.subscriptions
      where vault = $1::text and status = 'active' order by id`,
    [vault.toLowerCase()],
  );
  return rows.map(toSubscriber);
}
