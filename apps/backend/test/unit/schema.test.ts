import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TABLES, type TestDb, testDb } from '../helpers/db';

const VAULT = `0x${'ab'.repeat(20)}`;
const hash = (n: number) => n.toString(16).padStart(64, '0');

let db: TestDb;
beforeAll(async () => {
  db = await testDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
});

const count = async (table: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`))[0].n;

async function addSub(email: string, o: { status?: string; createdAt?: string; role?: string; n?: number } = {}) {
  const [row] = await db.query<{ id: string }>(
    `insert into public.subscriptions (email, vault, role, lang, status, confirm_hash, created_at)
     values ($1, $2, $3, 'en', $4, $5, $6::timestamptz) returning id::text as id`,
    [email, VAULT, o.role ?? 'owner', o.status ?? 'pending', hash(o.n ?? 1), o.createdAt ?? new Date().toISOString()],
  );
  return row.id;
}

describe('the schema on PGlite', () => {
  it('applies the init migration and skips the Supabase-only schedule', () => {
    expect(db.applied).toEqual(['20261123000000_init.sql']);
    expect(db.skipped).toEqual(['20261123000100_schedule.sql']);
  });

  it('turns RLS on for every table and defines no policy', async () => {
    const rows = await db.query<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
    expect(rows.every((r) => r.rls)).toBe(true);
    const [p] = await db.query<{ n: number }>(`select count(*)::int as n from pg_policies where schemaname = 'public'`);
    expect(p.n).toBe(0);
  });

  it('keeps one subscription per email, vault and role, whatever the case of the email', async () => {
    await addSub('Alice@Example.com');
    await expect(addSub('alice@EXAMPLE.COM', { n: 2 })).rejects.toThrow(/subscriptions_one_per_role/);
    await addSub('alice@example.com', { role: 'heir', n: 3 });
    expect(await count('subscriptions')).toBe(2);
  });

  it('rejects rows that break the checks', async () => {
    await expect(
      db.query(
        `insert into public.subscriptions (email, vault, role, lang, confirm_hash) values ('a@b.co', $1, 'thief', 'en', $2)`,
        [VAULT, hash(1)],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `insert into public.subscriptions (email, vault, role, lang, confirm_hash) values ('a@b.co', $1, 'owner', 'en', $2)`,
        [`0x${'AB'.repeat(20)}`, hash(1)],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `insert into public.vaults (address, owner, drill, created_block, updated_block, state)
         values ($1, $1, true, 1, 1, 'lost')`,
        [VAULT],
      ),
    ).rejects.toThrow(/vaults_state/);
  });

  it('deletes deliveries with their subscription and roles with their vault', async () => {
    const id = await addSub('a@b.co');
    await db.query(
      `insert into public.deliveries (subscription_id, kind, period_key) values ($1::bigint, 'welcome', 'once')`,
      [id],
    );
    await db.query('delete from public.subscriptions where id = $1::bigint', [id]);
    expect(await count('deliveries')).toBe(0);
    await db.query(
      'insert into public.vaults (address, owner, drill, created_block, updated_block) values ($1, $1, true, 1, 1)',
      [VAULT],
    );
    await db.query(`insert into public.vault_roles (vault, address, role) values ($1, $1, 'owner')`, [VAULT]);
    await db.query('delete from public.vaults where address = $1', [VAULT]);
    expect(await count('vault_roles')).toBe(0);
  });

  it('cleanup drops pending rows after 48 h and rate limits after 24 h, and keeps active rows', async () => {
    const now = Date.UTC(2026, 10, 30, 12);
    const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
    await addSub('old@b.co', { createdAt: hoursAgo(49), n: 1 });
    await addSub('new@b.co', { createdAt: hoursAgo(47), n: 2 });
    await addSub('kept@b.co', { createdAt: hoursAgo(200), status: 'active', n: 3 });
    await db.query(
      `insert into public.rate_limits (key, window_start, count) values ('ip:a', $1::timestamptz, 1), ('ip:b', $2::timestamptz, 1)`,
      [hoursAgo(25), hoursAgo(1)],
    );
    const [r] = await db.query<{ r: unknown }>('select public.atropyle_cleanup($1::timestamptz) as r', [
      new Date(now).toISOString(),
    ]);
    expect(r.r).toEqual({ pending: 1, rateLimits: 1, integrityRuns: 0, keeperLog: 0 });
    const left = await db.query<{ email: string }>('select email::text as email from public.subscriptions order by 1');
    expect(left.map((x) => x.email)).toEqual(['kept@b.co', 'new@b.co']);
    expect(await count('rate_limits')).toBe(1);
  });

  it('cleanup drops keeper_log rows after 90 days and integrity runs after 30 days (M5)', async () => {
    const now = Date.UTC(2026, 10, 30, 12);
    const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();
    await db.query(
      `insert into public.keeper_log (vault, action, tx_hash, status, chain_at, at)
       values ($1, 'poke', $2, 'sent', 1, $3::timestamptz), ($1, 'poke', $4, 'sent', 2, $5::timestamptz)`,
      [VAULT, `0x${hash(1)}`, daysAgo(91), `0x${hash(2)}`, daysAgo(89)],
    );
    await db.query(
      `insert into public.integrity_runs (at, block, ok, report)
       values ($1::timestamptz, 1, true, '{}'), ($2::timestamptz, 2, true, '{}')`,
      [daysAgo(31), daysAgo(29)],
    );
    const [r] = await db.query<{ r: unknown }>('select public.atropyle_cleanup($1::timestamptz) as r', [
      new Date(now).toISOString(),
    ]);
    expect(r.r).toEqual({ pending: 0, rateLimits: 0, integrityRuns: 1, keeperLog: 1 });
    expect(await db.query('select chain_at::int as c from public.keeper_log')).toEqual([{ c: 2 }]);
    expect(await count('integrity_runs')).toBe(1);
  });
});
