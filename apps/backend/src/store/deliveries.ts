import type { Sql } from '../db/sql';
import type { EmailKind } from '../email/kinds';

export interface DeliveryKey {
  subscriptionId: string;
  kind: EmailKind;
  periodKey: string;
}

/** An unsent claim older than this belongs to a run that died; another run may take it. */
export const CLAIM_STALE_MS = 10 * 60_000;

const keyParams = (k: DeliveryKey) => [k.subscriptionId, k.kind, k.periodKey];

/** True when this run may send the email: no row yet, or an unsent claim that went stale. */
export async function claimDelivery(sql: Sql, key: DeliveryKey, nowMs: number): Promise<boolean> {
  const rows = await sql.query(
    `insert into public.deliveries (subscription_id, kind, period_key, claimed_at)
     values ($1::bigint, $2::text, $3::text, $4::timestamptz)
     on conflict (subscription_id, kind, period_key) do update set claimed_at = excluded.claimed_at
       where public.deliveries.sent_at is null and public.deliveries.claimed_at < $5::timestamptz
     returning 1 as claimed`,
    [...keyParams(key), new Date(nowMs).toISOString(), new Date(nowMs - CLAIM_STALE_MS).toISOString()],
  );
  return rows.length > 0;
}

export async function completeDelivery(sql: Sql, key: DeliveryKey, providerId: string, nowMs: number): Promise<void> {
  await sql.query(
    `update public.deliveries set sent_at = $4::timestamptz, provider_id = $5::text
      where subscription_id = $1::bigint and kind = $2::text and period_key = $3::text`,
    [...keyParams(key), new Date(nowMs).toISOString(), providerId],
  );
}

/** Gives an unsent claim back, so the next tick tries again. A sent row is never released. */
export async function releaseDelivery(sql: Sql, key: DeliveryKey): Promise<void> {
  await sql.query(
    `delete from public.deliveries
      where subscription_id = $1::bigint and kind = $2::text and period_key = $3::text and sent_at is null`,
    keyParams(key),
  );
}
