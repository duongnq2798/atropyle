import { type CreatedVault, type StateName, stringify, type VaultEvent } from '@atropyle/sdk';
import { type Address, getAddress } from 'viem';
import type { StoredAsset, VaultView } from '../chain/port';
import type { Sql } from '../db/sql';
import type { Role } from '../types';

const big = (s: string | null): bigint | null => (s === null ? null : BigInt(s));
const low = (a: string) => a.toLowerCase();

/** A vault the factory created: the row and its owner role, before the first view is read. Idempotent. */
export async function insertCreated(sql: Sql, c: CreatedVault, nowIso: string): Promise<void> {
  await sql.query(
    `insert into public.vaults (address, owner, drill, created_block, updated_block, updated_at)
     values ($1::text, $2::text, $3::boolean, $4::bigint, $4::bigint, $5::timestamptz)
     on conflict (address) do nothing`,
    [low(c.vault), low(c.owner), c.drill, c.blockNumber.toString(), nowIso],
  );
  await sql.query(
    `insert into public.vault_roles (vault, address, role) values ($1::text, $2::text, 'owner') on conflict do nothing`,
    [low(c.vault), low(c.owner)],
  );
}

/** Stores events once (the primary key dedupes a re-scanned range). Returns how many were new. */
export async function insertEvents(sql: Sql, events: readonly { event: VaultEvent; at: bigint }[]): Promise<number> {
  let inserted = 0;
  for (const { event: e, at } of events) {
    const rows = await sql.query(
      `insert into public.vault_events (tx_hash, log_index, vault, name, block, at, args)
       values ($1::text, $2::int, $3::text, $4::text, $5::bigint, $6::bigint, $7::jsonb)
       on conflict (tx_hash, log_index) do nothing
       returning 1 as inserted`,
      [
        low(e.transactionHash),
        e.logIndex,
        low(e.address),
        e.name,
        e.blockNumber.toString(),
        at.toString(),
        stringify(e.args),
      ],
    );
    inserted += rows.length;
  }
  return inserted;
}

const opt = (v: bigint | null) => (v === null ? null : v.toString());

/**
 * Upserts the vault from a fresh view, ties last_alive to the block of its Alive event (the period key of check-in
 * reminders, spec §9.3.2) and replaces its roles. last_alive_block stays null until that Alive event is indexed.
 */
export async function saveView(sql: Sql, v: VaultView, nowIso: string): Promise<void> {
  await sql.query(
    `insert into public.vaults (address, owner, drill, created_block, state, pending_state, last_alive, late_at,
       window_ends_at, recovery_target, next_check_at, expires_at, expired, released, assets, updated_block, updated_at)
     values ($1::text, $2::text, $3::boolean, $4::bigint, $5::text, $6::text, $7::bigint, $8::bigint, $9::bigint,
       $10::text, $11::bigint, $12::bigint, $13::boolean, $14::boolean, $15::jsonb, $4::bigint, $16::timestamptz)
     on conflict (address) do update set
       owner = excluded.owner, state = excluded.state, pending_state = excluded.pending_state,
       last_alive = excluded.last_alive, late_at = excluded.late_at, window_ends_at = excluded.window_ends_at,
       recovery_target = excluded.recovery_target, next_check_at = excluded.next_check_at,
       expires_at = excluded.expires_at, expired = excluded.expired, released = excluded.released,
       assets = excluded.assets, updated_block = excluded.updated_block, updated_at = excluded.updated_at`,
    [
      low(v.vault),
      low(v.owner),
      v.drill,
      v.blockNumber.toString(),
      v.state,
      v.pending,
      v.lastAlive.toString(),
      v.lateAt.toString(),
      opt(v.windowEndsAt),
      v.recoveryTarget === null ? null : low(v.recoveryTarget),
      opt(v.nextCheckAt),
      opt(v.expiresAt),
      v.expired,
      v.released,
      stringify(v.assets),
      nowIso,
    ],
  );
  await sql.query(
    `update public.vaults set last_alive_block = (
       select e.block from public.vault_events e
        where e.vault = $1::text and e.name = 'Alive' and e.args ->> 'at' = $2::text
        order by e.block desc limit 1)
      where address = $1::text`,
    [low(v.vault), v.lastAlive.toString()],
  );
  await sql.query('delete from public.vault_roles where vault = $1::text', [low(v.vault)]);
  for (const r of v.roles) {
    await sql.query(
      'insert into public.vault_roles (vault, address, role) values ($1::text, $2::text, $3::text) on conflict do nothing',
      [low(v.vault), low(r.address), r.role],
    );
  }
}

/** Every indexed vault: the scan's resume list. */
export async function knownVaults(sql: Sql): Promise<Address[]> {
  const rows = await sql.query<{ address: string }>(
    'select address from public.vaults order by created_block, address',
  );
  return rows.map((r) => getAddress(r.address));
}

export interface VaultRow {
  address: Address;
  owner: Address;
  drill: boolean;
  createdBlock: bigint;
  state: StateName;
  pendingState: StateName;
  lastAlive: bigint | null;
  lastAliveBlock: bigint | null;
  lateAt: bigint | null;
  windowEndsAt: bigint | null;
  recoveryTarget: Address | null;
  nextCheckAt: bigint | null;
  expiresAt: bigint | null;
  expired: boolean;
  released: boolean;
  assets: StoredAsset[];
  updatedBlock: bigint;
}

interface RawVault {
  address: string;
  owner: string;
  drill: boolean;
  created_block: string;
  state: StateName;
  pending_state: StateName;
  last_alive: string | null;
  last_alive_block: string | null;
  late_at: string | null;
  window_ends_at: string | null;
  recovery_target: string | null;
  next_check_at: string | null;
  expires_at: string | null;
  expired: boolean;
  released: boolean;
  assets: StoredAsset[];
  updated_block: string;
}

export async function getVault(sql: Sql, vault: Address): Promise<VaultRow | null> {
  const rows = await sql.query<RawVault>(
    `select address, owner, drill, created_block::text as created_block, state, pending_state,
            last_alive::text as last_alive, last_alive_block::text as last_alive_block, late_at::text as late_at,
            window_ends_at::text as window_ends_at, recovery_target, next_check_at::text as next_check_at,
            expires_at::text as expires_at, expired, released, assets, updated_block::text as updated_block
       from public.vaults where address = $1::text`,
    [low(vault)],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    address: getAddress(r.address),
    owner: getAddress(r.owner),
    drill: r.drill,
    createdBlock: BigInt(r.created_block),
    state: r.state,
    pendingState: r.pending_state,
    lastAlive: big(r.last_alive),
    lastAliveBlock: big(r.last_alive_block),
    lateAt: big(r.late_at),
    windowEndsAt: big(r.window_ends_at),
    recoveryTarget: r.recovery_target === null ? null : getAddress(r.recovery_target),
    nextCheckAt: big(r.next_check_at),
    expiresAt: big(r.expires_at),
    expired: r.expired,
    released: r.released,
    assets: r.assets,
    updatedBlock: BigInt(r.updated_block),
  };
}

export interface AddressVault {
  vault: Address;
  roles: Role[];
  drill: boolean;
  state: StateName;
  released: boolean;
}

/** Vaults where `address` holds a role, newest first, roles in the order owner, guardian, heir (spec §9.6 /me). */
export async function vaultsOfAddress(sql: Sql, address: Address): Promise<AddressVault[]> {
  const rows = await sql.query<{ address: string; roles: Role[]; drill: boolean; state: StateName; released: boolean }>(
    `select v.address, v.drill, v.state, v.released,
            array_agg(r.role order by array_position(array['owner', 'guardian', 'heir'], r.role)) as roles
       from public.vault_roles r
       join public.vaults v on v.address = r.vault
      where r.address = $1::text
      group by v.address, v.drill, v.state, v.released, v.created_block
      order by v.created_block desc, v.address
      limit 200`,
    [address.toLowerCase()],
  );
  return rows.map((r) => ({
    vault: getAddress(r.address),
    roles: r.roles,
    drill: r.drill,
    state: r.state,
    released: r.released,
  }));
}

/** Home page counters (spec §9.6 /stats). Every vault emits one Alive when it is created; the rest are check-ins. */
export async function vaultStats(sql: Sql): Promise<{ vaults: string; drills: string; checkIns: string }> {
  const [row] = await sql.query<{ vaults: string; drills: string; check_ins: string }>(
    `select count(*)::text as vaults,
            (count(*) filter (where drill))::text as drills,
            greatest((select count(*) from public.vault_events where name = 'Alive') - count(*), 0)::text as check_ins
       from public.vaults`,
  );
  return { vaults: row.vaults, drills: row.drills, checkIns: row.check_ins };
}
