/**
 * The one database interface of the backend. PGlite (tests) and postgres.js (Supabase) both satisfy it.
 *
 * Conventions (plan 8, "Conventions every task relies on"): parameters are cast in the SQL text ($1::bigint,
 * $2::jsonb, ...); bigints are passed and selected as decimal text; addresses are stored lowercase.
 */
export type SqlParam = string | number | boolean | null;

export interface Sql {
  query<T extends object = Record<string, unknown>>(text: string, params?: readonly SqlParam[]): Promise<T[]>;
  /** Runs `fn` in one transaction. A `begin` inside the callback joins the outer transaction. */
  begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

export interface Db extends Sql {
  close(): Promise<void>;
}

/** A timestamptz column as an ISO 8601 UTC string, whichever driver read it. */
export function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}
