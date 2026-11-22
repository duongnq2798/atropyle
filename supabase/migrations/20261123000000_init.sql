-- Atropyle backend schema (spec 2026-11-22 §9.1; plan 8 ruling 8 adds meta and a few columns).
--
-- Row level security is on for every table and no policy exists, so the anon and authenticated roles of the
-- REST API see nothing. The Edge Functions connect through SUPABASE_DB_URL as the owner of these tables,
-- which RLS does not restrict. Addresses are stored lowercase; bigints are chain values (blocks, seconds).

create schema if not exists extensions;
create extension if not exists citext with schema extensions;

-- Indexer position: the last block whose logs are stored.
create table public.cursors (
  name text primary key,
  block bigint not null check (block >= 0),
  updated_at timestamptz not null default now()
);

-- Small shared state: the tick lease, indexer and keeper status (/health), ops-alert state.
create table public.meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.vaults (
  address text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  owner text not null check (owner ~ '^0x[0-9a-f]{40}$'),
  drill boolean not null,
  created_block bigint not null,
  state text not null default 'active',
  pending_state text not null default 'active',
  last_alive bigint,
  -- Block of the Alive event whose `at` equals last_alive: the period key of check-in reminders.
  last_alive_block bigint,
  late_at bigint,
  window_ends_at bigint,
  recovery_target text check (recovery_target ~ '^0x[0-9a-f]{40}$'),
  -- Chain time at which the keeper looks at this vault again; null when it never needs to.
  next_check_at bigint,
  expires_at bigint,
  expired boolean not null default false,
  released boolean not null default false,
  -- [{ index, kind, token, id, decimals }]: what distribute() pays, for the payout email.
  assets jsonb not null default '[]'::jsonb,
  updated_block bigint not null,
  updated_at timestamptz not null default now(),
  -- Block of the stored view; null until the indexer has read one. Notices wait for events newer than it.
  view_block bigint,
  -- Set while the stored view is not current: its read failed, did not happen in time, or came from a node behind
  -- the vault's newest event. The indexer reads it again at view_retry_at (back-off 1 minute doubling to 1 hour).
  view_stale_since timestamptz,
  view_retry_at timestamptz,
  view_failures int not null default 0,
  constraint vaults_state check (state in ('active', 'grace', 'recovery', 'releasedInherit', 'releasedRecover')),
  constraint vaults_pending_state check (
    pending_state in ('active', 'grace', 'recovery', 'releasedInherit', 'releasedRecover')
  )
);
create index vaults_due on public.vaults (next_check_at) where next_check_at is not null and not expired;
create index vaults_stale on public.vaults (view_retry_at) where view_stale_since is not null;

create table public.vault_roles (
  vault text not null references public.vaults (address) on delete cascade,
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  role text not null check (role in ('owner', 'guardian', 'heir')),
  primary key (vault, address, role)
);
create index vault_roles_address on public.vault_roles (address);

-- Every vault event once (the primary key dedupes re-scanned ranges).
create table public.vault_events (
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index int not null,
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  name text not null,
  block bigint not null,
  -- Chain time of the block.
  at bigint not null,
  args jsonb not null,
  notified_at timestamptz,
  primary key (tx_hash, log_index)
);
create index vault_events_unnotified on public.vault_events (block, log_index) where notified_at is null;
create index vault_events_vault on public.vault_events (vault, name);

-- Only hashes of tokens are stored. Unsubscribing deletes the row (spec §9.5).
create table public.subscriptions (
  id bigint generated always as identity primary key,
  email extensions.citext not null check (length(email) between 3 and 254),
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  role text not null check (role in ('owner', 'guardian', 'heir')),
  lang text not null check (lang in ('en', 'vi')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  confirm_hash text not null check (confirm_hash ~ '^[0-9a-f]{64}$'),
  unsub_hash text unique check (unsub_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint subscriptions_one_per_role unique (email, vault, role)
);
create index subscriptions_vault on public.subscriptions (vault) where status = 'active';
create index subscriptions_confirm on public.subscriptions (confirm_hash);

-- One row per email that was (or is being) sent: the primary key is what makes notices idempotent.
create table public.deliveries (
  subscription_id bigint not null references public.subscriptions (id) on delete cascade,
  kind text not null,
  period_key text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_id text,
  primary key (subscription_id, kind, period_key)
);
-- The global cap of /subscribe counts the confirm emails of the last hour.
create index deliveries_confirm on public.deliveries (claimed_at) where kind = 'confirm';

-- Fixed one-hour windows; keys are HMACs of the IP or the email, never the values themselves.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table public.keeper_log (
  id bigint generated always as identity primary key,
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  action text check (action in ('poke', 'distribute')),
  tx_hash text check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  status text not null,
  error text,
  -- Chain time of the keeper run (KeeperReport.ranAt): the distribute back-off compares chain times.
  chain_at bigint not null,
  at timestamptz not null default now()
);
create index keeper_log_distribute on public.keeper_log (vault, chain_at) where action = 'distribute' and status = 'sent';

create table public.integrity_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  block bigint not null,
  ok boolean not null,
  report jsonb not null
);

alter table public.cursors enable row level security;
alter table public.meta enable row level security;
alter table public.vaults enable row level security;
alter table public.vault_roles enable row level security;
alter table public.vault_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.deliveries enable row level security;
alter table public.rate_limits enable row level security;
alter table public.keeper_log enable row level security;
alter table public.integrity_runs enable row level security;

-- Daily job (schedule migration): pending sign-ups older than 48 h, rate-limit windows older than 24 h (spec
-- §9.1, §9.5) and integrity runs older than 30 days.
create function public.atropyle_cleanup(p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  pending_count int;
  limit_count int;
  integrity_count int;
begin
  delete from public.subscriptions where status = 'pending' and created_at < p_now - interval '48 hours';
  get diagnostics pending_count = row_count;
  delete from public.rate_limits where window_start < p_now - interval '24 hours';
  get diagnostics limit_count = row_count;
  delete from public.integrity_runs where at < p_now - interval '30 days';
  get diagnostics integrity_count = row_count;
  return jsonb_build_object('pending', pending_count, 'rateLimits', limit_count, 'integrityRuns', integrity_count);
end;
$$;
revoke execute on function public.atropyle_cleanup(timestamptz) from public;

-- Supabase grants the API roles access to new tables by default; take it back. The roles do not exist in PGlite.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke execute on function public.atropyle_cleanup(timestamptz) from %I', r);
    end if;
  end loop;
end;
$$;
