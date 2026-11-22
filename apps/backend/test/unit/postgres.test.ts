import { describe, expect, it } from 'vitest';
import { connectPostgres, type PgClient, type PgQueryable } from '../../src/db/postgres';

function fakeClient() {
  const calls: { where: string; text: string; params: unknown[] }[] = [];
  const ends: ({ timeout?: number } | undefined)[] = [];
  const queryable = (where: string): PgQueryable => ({
    unsafe: async (text: string, params: never[] = []) => {
      calls.push({ where, text, params: [...params] });
      return [{ where }];
    },
  });
  const client: PgClient = {
    ...queryable('root'),
    begin: async (fn) => fn(queryable('tx')),
    end: async (o) => {
      ends.push(o);
    },
  };
  return { client, calls, ends };
}

describe('connectPostgres (production driver, spec §9.2)', () => {
  it('connects with the pooler options: no prepared statements, one connection', () => {
    const seen: { url: string; options: Record<string, unknown> }[] = [];
    connectPostgres('postgres://u:p@db.example:6543/postgres', (url, options) => {
      seen.push({ url, options });
      return fakeClient().client;
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('postgres://u:p@db.example:6543/postgres');
    expect(seen[0].options).toMatchObject({ prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });
  });

  it('passes the text and the parameters through and returns a plain array', async () => {
    const f = fakeClient();
    const db = connectPostgres('postgres://x', () => f.client);
    const rows = await db.query<{ where: string }>('select $1::text as a', ['b']);
    expect(rows).toEqual([{ where: 'root' }]);
    expect(Array.isArray(rows)).toBe(true);
    expect(f.calls).toEqual([{ where: 'root', text: 'select $1::text as a', params: ['b'] }]);
  });

  it('runs a transaction on the transaction handle and joins nested begin calls', async () => {
    const f = fakeClient();
    const db = connectPostgres('postgres://x', () => f.client);
    await db.begin(async (tx) => {
      await tx.query('select 1');
      await tx.begin(async (inner) => {
        await inner.query('select 2');
      });
    });
    expect(f.calls.map((c) => `${c.where}:${c.text}`)).toEqual(['tx:select 1', 'tx:select 2']);
  });

  it('closes the pool with a timeout', async () => {
    const f = fakeClient();
    await connectPostgres('postgres://x', () => f.client).close();
    expect(f.ends).toEqual([{ timeout: 5 }]);
  });
});
