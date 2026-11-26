import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectPostgres } from '../../src/db/postgres';
import type { Db } from '../../src/db/sql';
import { type Action, type FakePg, startFakePg } from '../helpers/fake-pg';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A callback awaits `passed`; the test calls `open` once it has seen the transaction reject. */
function gate() {
  let open!: () => void;
  const passed = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { passed, open };
}

/** Long enough for a write that postgres.js schedules with setImmediate to go out, or to throw. */
const SETTLE_MS = 50;

/**
 * The production adapter with the real postgres.js against a fake server that drops the connection. The server or
 * Supabase's pooler can close a connection at any time (a restart, a network reset, an idle-in-transaction
 * timeout). postgres.js 3.4.9 then rejects the open transaction, but it still writes the transaction's next
 * statement, or its ROLLBACK or COMMIT, to the closed connection: a TypeError from a timer, after which every query
 * of the client failed with CONNECT_TIMEOUT.
 */
describe('connectPostgres when the server closes the connection', () => {
  let pg: FakePg;
  let db: Db;
  let uncaught: unknown[];
  const onUncaught = (e: unknown) => uncaught.push(e);

  beforeEach(async () => {
    uncaught = [];
    process.on('uncaughtException', onUncaught);
    pg = await startFakePg();
    db = connectPostgres(pg.url);
    await db.query('select 1');
  });

  afterEach(async () => {
    await db.close();
    await pg.close();
    process.off('uncaughtException', onUncaught);
  });

  it.each<[string, Action]>([
    ['the server closes the socket', 'end-after'],
    ['the idle-in-transaction timeout ends the session', { fatalAfter: '25P03' }],
  ])('answers the next query when %s while a transaction waits', async (_, action) => {
    pg.once(/^begin/i, action);
    const g = gate();
    const work = db.begin(async (tx) => {
      await g.passed;
      await tx.query('select $1::text', ['next']);
    });
    await expect(work).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    g.open(); // the callback's next statement, and the ROLLBACK after it, would go out now
    await sleep(SETTLE_MS);
    expect(uncaught).toEqual([]);
    await expect(db.query('select 2')).resolves.toEqual([]);
    expect(pg.startups()).toBe(2);
  });

  it('never sends a statement of that transaction on the next connection', async () => {
    pg.once(/^begin/i, 'end-after');
    const g = gate();
    const work = db.begin(async (tx) => {
      await g.passed;
      await tx.query('update t set late = $1::text', ['yes']);
    });
    await expect(work).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    await expect(db.query('select 2')).resolves.toEqual([]);
    g.open();
    await sleep(SETTLE_MS);
    // Run outside the transaction, it would keep a write that the server rolled back with the old session.
    expect(pg.statements).not.toContain('update t set late = $1::text');
    expect(uncaught).toEqual([]);
    await expect(db.query('select 3')).resolves.toEqual([]);
  });

  it.each<[string, Action]>([
    ['closes', 'end'],
    ['is reset', 'reset'],
  ])('answers the next query after the connection %s during a statement of a transaction', async (_, action) => {
    pg.once(/^insert/i, action);
    const work = db.begin(async (tx) => {
      await tx.query('insert into t values ($1::text)', ['a']);
    });
    await expect(work).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    await sleep(SETTLE_MS); // the ROLLBACK would go out here
    expect(uncaught).toEqual([]);
    await expect(db.query('select 2')).resolves.toEqual([]);
    expect(pg.startups()).toBe(2);
  });

  it('answers the next query after the connection closes between the last statement and COMMIT', async () => {
    pg.once(/^insert/i, 'end-after');
    const g = gate();
    const work = db.begin(async (tx) => {
      await tx.query('insert into t values ($1::text)', ['a']);
      await g.passed;
      return 'done';
    });
    await expect(work).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    g.open(); // the callback returns now, and the COMMIT would go out
    await sleep(SETTLE_MS);
    expect(uncaught).toEqual([]);
    await expect(db.query('select 2')).resolves.toEqual([]);
    expect(pg.startups()).toBe(2);
  });

  it('commits a transaction that waited for the connection behind the one that lost it', async () => {
    pg.once(/^insert/i, 'end');
    const first = db.begin(async (tx) => {
      await tx.query('insert into t values ($1::text)', ['a']);
    });
    const second = db.begin(async (tx) => {
      await tx.query('update t set b = $1::text', ['c']);
      return 'second';
    });
    await expect(first).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    await expect(second).resolves.toBe('second');
    expect(pg.statements.slice(-3)).toEqual(['begin ', 'update t set b = $1::text', 'commit']);
    expect(uncaught).toEqual([]);
  }, 5_000);

  it('answers the next query after the connection closes during a query outside a transaction', async () => {
    pg.once(/^update/i, 'end');
    await expect(db.query('update t set a = $1::text', ['b'])).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    await expect(db.query('select 2')).resolves.toEqual([]);
    expect(uncaught).toEqual([]);
    expect(pg.startups()).toBe(2);
  });

  it('answers the next query after a restart ends the session during a query', async () => {
    // A server or pooler restart sends FATAL 57P01 and closes. postgres.js keeps that error on the connection, and
    // the first query of its next connection rejected with it.
    pg.once(/^update/i, { fatal: '57P01' });
    await expect(db.query('update t set a = $1::text', ['b'])).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    await expect(db.query('select 2')).resolves.toEqual([]);
    expect(pg.startups()).toBe(2);
  });

  it('still rolls back a failed statement and keeps a healthy connection', async () => {
    pg.once(/^insert/i, { error: '23505' });
    const work = db.begin(async (tx) => {
      await tx.query('insert into t values ($1::text)', ['a']);
    });
    await expect(work).rejects.toMatchObject({ code: '23505' });
    expect(pg.statements.slice(-2)).toEqual(['insert into t values ($1::text)', 'rollback']);
    await expect(db.query('select 2')).resolves.toEqual([]);
    expect(pg.startups()).toBe(1);
  }, 5_000);

  it('commits a transaction on a healthy connection', async () => {
    const result = await db.begin(async (tx) => {
      await tx.query('insert into t values ($1::text)', ['a']);
      return 'done';
    });
    expect(result).toBe('done');
    expect(pg.statements.slice(-3)).toEqual(['begin ', 'insert into t values ($1::text)', 'commit']);
    expect(pg.startups()).toBe(1);
  });
});
