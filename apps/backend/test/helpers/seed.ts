import type { Address } from 'viem';
import { sha256Hex, unsubToken } from '../../src/crypto';
import type { Sql } from '../../src/db/sql';
import type { Subscriber } from '../../src/store/subscriptions';
import type { Lang, Role } from '../../src/types';

/** An already confirmed subscription, as if the double opt-in had happened. */
export async function activeSubscriber(
  sql: Sql,
  o: { email: string; vault: Address; role: Role; lang?: Lang; tokenSecret?: string },
): Promise<Subscriber> {
  const lang = o.lang ?? 'en';
  const [row] = await sql.query<{ id: string }>(
    `insert into public.subscriptions (email, vault, role, lang, status, confirm_hash, confirmed_at)
     values ($1::text, $2::text, $3::text, $4::text, 'active', $5::text, now())
     returning id::text as id`,
    [o.email, o.vault.toLowerCase(), o.role, lang, await sha256Hex(`seed:${o.email}:${o.role}:${o.vault}`)],
  );
  const hash = await sha256Hex(await unsubToken(o.tokenSecret ?? 't'.repeat(32), row.id));
  await sql.query('update public.subscriptions set unsub_hash = $2::text where id = $1::bigint', [row.id, hash]);
  return { id: row.id, email: o.email, lang, role: o.role, vault: o.vault };
}
