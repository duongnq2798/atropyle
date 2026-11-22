import postgres from 'postgres';
import type { Db, Sql, SqlParam } from './sql';

/** The part of a postgres.js client, and of its transaction handle, that this adapter uses. */
export interface PgQueryable {
  unsafe(text: string, params?: never[]): PromiseLike<Iterable<unknown>>;
}

export interface PgClient extends PgQueryable {
  begin<T>(fn: (tx: PgQueryable) => Promise<T>): Promise<T>;
  end(o?: { timeout?: number }): Promise<void>;
}

export type PgFactory = (url: string, options: Record<string, unknown>) => PgClient;

/**
 * Supabase's pooler in transaction mode does not support prepared statements (Supabase's own Edge Function
 * examples pass prepare: false). One connection per isolate is enough: a function handles one request at a time.
 * idle_timeout and connect_timeout are in seconds.
 */
export const PG_OPTIONS = { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 } as const;

const defaultFactory: PgFactory = (url, options) =>
  postgres(url, options as Parameters<typeof postgres>[1]) as unknown as PgClient;

function run(q: PgQueryable) {
  return async <T extends object>(text: string, params: readonly SqlParam[] = []): Promise<T[]> =>
    [...(await q.unsafe(text, [...params] as never[]))] as T[];
}

function joined(tx: PgQueryable): Sql {
  const self: Sql = {
    query: run(tx),
    begin: (fn) => fn(self),
  };
  return self;
}

/** The production database: SUPABASE_DB_URL through postgres.js (bundled as npm:postgres@3.4.9). */
export function connectPostgres(url: string, factory: PgFactory = defaultFactory): Db {
  const client = factory(url, { ...PG_OPTIONS, onnotice: () => {} });
  return {
    query: run(client),
    begin: (fn) => client.begin((tx) => fn(joined(tx))),
    close: () => client.end({ timeout: 5 }),
  };
}
