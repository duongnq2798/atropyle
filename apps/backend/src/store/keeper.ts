import type { KeeperAction } from '@atropyle/sdk';
import { type Address, getAddress, type Hex } from 'viem';
import type { Sql } from '../db/sql';

/** Spec §9.3.3: vaults whose next_check_at has come and whose Drill has not expired, the most overdue first. */
export async function dueVaults(sql: Sql, now: bigint, limit = 50): Promise<Address[]> {
  const rows = await sql.query<{ address: string }>(
    `select address from public.vaults
      where next_check_at is not null and next_check_at <= $1::bigint and not expired
        and (expires_at is null or expires_at > $1::bigint)
      order by next_check_at, address
      limit $2::int`,
    [now.toString(), limit],
  );
  return rows.map((r) => getAddress(r.address));
}

export async function setNextCheck(sql: Sql, vault: Address, next: bigint | null): Promise<void> {
  await sql.query('update public.vaults set next_check_at = $2::bigint where address = $1::text', [
    vault.toLowerCase(),
    next === null ? null : next.toString(),
  ]);
}

/** Chain time of the last distribute this keeper sent, per vault: the SDK's distribute back-off. */
export async function lastDistributes(sql: Sql, vaults: readonly Address[]): Promise<Map<Address, bigint>> {
  const out = new Map<Address, bigint>();
  if (vaults.length === 0) return out;
  const rows = await sql.query<{ vault: string; at: string }>(
    `select vault, max(chain_at)::text as at from public.keeper_log
      where action = 'distribute' and status = 'sent' and vault = any(string_to_array($1::text, ','))
      group by vault`,
    [vaults.map((v) => v.toLowerCase()).join(',')],
  );
  for (const r of rows) out.set(getAddress(r.vault), BigInt(r.at));
  return out;
}

export interface KeeperLogRow {
  vault: Address;
  action: KeeperAction | null;
  txHash: Hex | null;
  status: string;
  /** An SDK error code; never a revert reason (chain text stays out of the database). */
  error: string | null;
  chainAt: bigint;
}

export async function logKeeper(sql: Sql, rows: readonly KeeperLogRow[], nowIso: string): Promise<void> {
  for (const r of rows) {
    await sql.query(
      `insert into public.keeper_log (vault, action, tx_hash, status, error, chain_at, at)
       values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::bigint, $7::timestamptz)`,
      [
        r.vault.toLowerCase(),
        r.action,
        r.txHash?.toLowerCase() ?? null,
        r.status,
        r.error,
        r.chainAt.toString(),
        nowIso,
      ],
    );
  }
}
