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
 * A jsonb parameter is already JSON text (the SDK's stringify, cast in the SQL as $n::jsonb). The server describes
 * it as jsonb, and postgres.js then serializes it with JSON.stringify, which would store a JSON string instead of
 * the object. This handler sends JSON text as it is, as PGlite does, and still parses json and jsonb results.
 */
const JSON_TEXT = {
  to: 114,
  from: [114, 3802],
  serialize: (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x)),
  parse: (x: string) => JSON.parse(x),
};

/**
 * Supabase's pooler in transaction mode does not support prepared statements (Supabase's own Edge Function
 * examples pass prepare: false). One connection per isolate is enough: a function handles one request at a time.
 * idle_timeout and connect_timeout are in seconds.
 */
export const PG_OPTIONS = {
  prepare: false,
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  types: { json: JSON_TEXT },
} as const;

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

/** A postgres.js client and how many times its connection has closed. */
interface Link {
  client: PgClient;
  closes: number;
}

function connectionClosed(): Error {
  return Object.assign(new Error('the database connection closed during the transaction'), {
    code: 'CONNECTION_CLOSED',
  });
}

/** What postgres.js gets for a transaction whose connection closed: it then sends neither ROLLBACK nor COMMIT. */
const abandoned = (): Promise<never> => new Promise(() => {});

/**
 * The production database: SUPABASE_DB_URL through postgres.js (bundled as npm:postgres@3.4.9).
 *
 * The server or the pooler can close a connection at any time: a restart, a network reset, an idle-in-transaction
 * timeout. postgres.js 3.4.9 does not reset a connection's state when its socket closes, so two guards keep a
 * client usable:
 *
 * - A client serves one connection. Once its connection closes, for any reason, the next query gets a new client
 *   and the old one is dropped. Reconnected, the old client could keep a write that was scheduled when the socket
 *   closed (it then never sends its StartupMessage: CONNECT_TIMEOUT) or the FATAL error of the old session (the
 *   first query of the new connection rejects with it). postgres.js reads the types once per connection anyway, so
 *   a new client adds no round trip.
 * - Nothing is sent for a transaction after its connection closed. postgres.js rejects the transaction at once, but
 *   it still sends the callback's next statement and then its ROLLBACK or COMMIT through the closed connection, or,
 *   if a query reconnected the client in between, through the next one, outside any transaction. The callback's
 *   statements then reject without being sent, and once the callback settles, postgres.js gets a promise that
 *   never settles, so it sends neither ROLLBACK nor COMMIT. The server has rolled the transaction back with its
 *   session, and `begin` has already rejected with CONNECTION_CLOSED.
 *
 * postgres.js reports a close through `onclose`, synchronously from the socket's close event. With max: 1 a close
 * during a transaction is the close of the transaction's connection. A close cannot happen between a check of
 * `closes` and the write it allows, which postgres.js makes in the same run of microtasks.
 */
export function connectPostgres(url: string, factory: PgFactory = defaultFactory): Db {
  const open = (): Link => {
    const link = { closes: 0 } as Link;
    link.client = factory(url, {
      ...PG_OPTIONS,
      onnotice: () => {},
      onclose: () => {
        link.closes++;
      },
    });
    return link;
  };
  let link = open();
  /** The current client, or a new one once its connection has closed. A transaction already waiting for the old
   * client's connection still runs there, so the old client is not ended. */
  const live = (): Link => {
    if (link.closes > 0) link = open();
    return link;
  };

  return {
    query: (text, params) => run(live().client)(text, params),
    begin: <T>(fn: (tx: Sql) => Promise<T>): Promise<T> => {
      const own = live();
      return own.client.begin(async (tx) => {
        const seen = own.closes;
        const lost = () => own.closes !== seen;
        const guarded: PgQueryable = {
          unsafe: (text, params) => (lost() ? Promise.reject(connectionClosed()) : tx.unsafe(text, params)),
        };
        let result: T;
        try {
          result = await fn(joined(guarded));
        } catch (e) {
          if (lost()) return abandoned();
          throw e;
        }
        return lost() ? abandoned() : result;
      });
    },
    close: () => link.client.end({ timeout: 5 }),
  };
}
