import { type Address, getAddress, type Hex } from 'viem';
import type { Sql } from '../db/sql';
import { type Subscriber, type SubscriberRow, toSubscriber } from './subscriptions';

export interface StoredEvent {
  txHash: Hex;
  logIndex: number;
  vault: Address;
  name: string;
  block: bigint;
  /** Chain time of the block. */
  at: bigint;
  /** Decoded event arguments; bigints are decimal strings, addresses checksummed (SDK stringify). */
  args: Record<string, unknown>;
}

interface RawEvent {
  tx_hash: string;
  log_index: number;
  vault: string;
  name: string;
  block: string;
  at: string;
  args: Record<string, unknown>;
}

const EVENT_COLUMNS = 'tx_hash, log_index, vault, name, block::text as block, at::text as at, args';

const toEvent = (r: RawEvent): StoredEvent => ({
  txHash: r.tx_hash as Hex,
  logIndex: r.log_index,
  vault: getAddress(r.vault),
  name: r.name,
  block: BigInt(r.block),
  at: BigInt(r.at),
  args: r.args,
});

export async function unnotifiedEvents(sql: Sql, limit = 200): Promise<StoredEvent[]> {
  const rows = await sql.query<RawEvent>(
    `select ${EVENT_COLUMNS} from public.vault_events where notified_at is null order by block, log_index limit $1::int`,
    [limit],
  );
  return rows.map(toEvent);
}

/** Every event of one name in one transaction of one vault: the payouts of a single distribute(). */
export async function eventsOfTx(sql: Sql, vault: Address, txHash: Hex, name: string): Promise<StoredEvent[]> {
  const rows = await sql.query<RawEvent>(
    `select ${EVENT_COLUMNS} from public.vault_events
      where vault = $1::text and tx_hash = $2::text and name = $3::text order by log_index`,
    [vault.toLowerCase(), txHash.toLowerCase(), name],
  );
  return rows.map(toEvent);
}

export async function markNotified(sql: Sql, events: readonly StoredEvent[], nowIso: string): Promise<void> {
  for (const e of events) {
    await sql.query(
      'update public.vault_events set notified_at = $3::timestamptz where tx_hash = $1::text and log_index = $2::int',
      [e.txHash.toLowerCase(), e.logIndex, nowIso],
    );
  }
}

export interface ReminderRow {
  sub: Subscriber;
  lastAlive: bigint;
  lateAt: bigint;
  /** last_alive_block: one reminder cycle per check-in (spec §9.3.2). */
  periodKey: string;
  /** Reminder kinds already sent in this cycle. */
  sent: string[];
}

/**
 * Owner subscriptions of active vaults at 50% of the period or later whose cycle is not finished (no checkin-due sent
 * yet). The vault must have a known check-in block: until its Alive event is indexed there is no period key.
 */
export async function reminderRows(sql: Sql, now: bigint, limit = 500): Promise<ReminderRow[]> {
  const rows = await sql.query<
    SubscriberRow & { last_alive: string; late_at: string; period_key: string; sent: string[] }
  >(
    `select s.id::text as id, s.email::text as email, s.lang, s.role, s.vault,
            v.last_alive::text as last_alive, v.late_at::text as late_at, v.last_alive_block::text as period_key,
            coalesce((select array_agg(d.kind order by d.kind) from public.deliveries d
                       where d.subscription_id = s.id and d.period_key = v.last_alive_block::text
                         and d.kind in ('checkin-50', 'checkin-80', 'checkin-due') and d.sent_at is not null),
                     '{}') as sent
       from public.vaults v
       join public.subscriptions s on s.vault = v.address and s.status = 'active' and s.role = 'owner'
      where v.state = 'active' and not v.expired and (v.expires_at is null or v.expires_at > $1::bigint)
        and v.last_alive_block is not null and v.late_at > v.last_alive
        and ($1::bigint - v.last_alive) * 2 >= v.late_at - v.last_alive
        and not exists (select 1 from public.deliveries d
                         where d.subscription_id = s.id and d.kind = 'checkin-due'
                           and d.period_key = v.last_alive_block::text and d.sent_at is not null)
      order by s.id
      limit $2::int`,
    [now.toString(), limit],
  );
  return rows.map((r) => ({
    sub: toSubscriber(r),
    lastAlive: BigInt(r.last_alive),
    lateAt: BigInt(r.late_at),
    periodKey: r.period_key,
    sent: r.sent,
  }));
}

export interface SummaryRow {
  sub: Subscriber;
  /** Check-ins by the owner: Alive events after the one emitted at creation. */
  checkIns: number;
  alarms: number;
  released: 'inheritance' | 'recovery' | null;
}

/** Owner subscriptions of Drills whose lifetime has ended (chain time) and that got no summary yet. */
export async function drillSummaryRows(sql: Sql, now: bigint, limit = 100): Promise<SummaryRow[]> {
  const rows = await sql.query<SubscriberRow & { alive: number; alarms: number; released_state: string | null }>(
    `select s.id::text as id, s.email::text as email, s.lang, s.role, s.vault,
            (select count(*) from public.vault_events e where e.vault = v.address and e.name = 'Alive')::int as alive,
            (select count(*) from public.vault_events e where e.vault = v.address and e.name = 'AlarmRaised')::int as alarms,
            (select e.args ->> 'state' from public.vault_events e
              where e.vault = v.address and e.name = 'Released' order by e.block limit 1) as released_state
       from public.vaults v
       join public.subscriptions s on s.vault = v.address and s.status = 'active' and s.role = 'owner'
      where v.drill and v.expires_at is not null and v.expires_at <= $1::bigint
        and not exists (select 1 from public.deliveries d
                         where d.subscription_id = s.id and d.kind = 'drill-summary' and d.sent_at is not null)
      order by s.id
      limit $2::int`,
    [now.toString(), limit],
  );
  return rows.map((r) => ({
    sub: toSubscriber(r),
    checkIns: Math.max(0, r.alive - 1),
    alarms: r.alarms,
    released: r.released_state === '7' ? 'recovery' : r.released_state === null ? null : 'inheritance',
  }));
}
