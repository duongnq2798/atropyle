import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import type { Db, Sql, SqlParam } from '../../src/db/sql';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));
/** First line of a migration that needs pg_cron, pg_net or Vault, which PGlite does not have. */
export const SUPABASE_ONLY = '-- atropyle:supabase-only';
export const TABLES = [
  'cursors',
  'meta',
  'vaults',
  'vault_roles',
  'vault_events',
  'subscriptions',
  'deliveries',
  'rate_limits',
  'keeper_log',
  'integrity_runs',
] as const;

export interface TestDb extends Db {
  pg: PGlite;
  applied: string[];
  skipped: string[];
  /** Empties every table and restarts the identity columns. */
  reset(): Promise<void>;
}

function wrap(q: PGlite | Transaction, inTx: boolean): Sql {
  const self: Sql = {
    async query<T extends object>(text: string, params: readonly SqlParam[] = []): Promise<T[]> {
      const r = await q.query<T>(text, [...params]);
      return r.rows;
    },
    async begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
      if (inTx) return fn(self);
      return (q as PGlite).transaction((tx) => fn(wrap(tx, true)));
    },
  };
  return self;
}

/** A fresh in-memory Postgres with every migration of supabase/migrations applied, except the Supabase-only ones. */
export async function testDb(): Promise<TestDb> {
  const pg = await PGlite.create({ extensions: { citext } });
  const applied: string[] = [];
  const skipped: string[] = [];
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    if (text.startsWith(SUPABASE_ONLY)) {
      skipped.push(file);
      continue;
    }
    await pg.exec(text);
    applied.push(file);
  }
  const sql = wrap(pg, false);
  return {
    query: sql.query,
    begin: sql.begin,
    pg,
    applied,
    skipped,
    reset: async () => {
      await pg.exec(`truncate table ${TABLES.map((t) => `public.${t}`).join(', ')} restart identity cascade`);
    },
    close: () => pg.close(),
  };
}
