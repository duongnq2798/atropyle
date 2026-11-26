import { createServer, type Socket } from 'node:net';

/**
 * What the server does with the next statement that matches a pattern:
 * - 'end': closes the socket instead of answering (the statement is in flight when the connection goes);
 * - 'reset': resets the socket instead of answering (ECONNRESET on the client);
 * - 'end-after': answers, then closes the socket 20 ms later (the connection goes while the client is idle);
 * - { fatal }: sends a FATAL error of that SQLSTATE instead of answering and closes the socket, as a server or pooler
 *   restart does (57P01);
 * - { fatalAfter }: answers, then 20 ms later sends that FATAL error and closes the socket, as the server's
 *   idle-in-transaction timeout does (25P03);
 * - { error }: answers with an ERROR of that SQLSTATE, a failed statement on a healthy connection.
 */
export type Action = 'end' | 'reset' | 'end-after' | { fatal: string } | { fatalAfter: string } | { error: string };

export interface FakePg {
  /** A postgres:// URL to this server. It asks for no password and offers no TLS. */
  readonly url: string;
  /** The text of every simple query and every Parse, in the order the server received them. */
  readonly statements: string[];
  /** How many StartupMessages the server has accepted, one per connection. */
  startups(): number;
  /** The next statement whose text matches `pattern` gets `action`, once. */
  once(pattern: RegExp, action: Action): void;
  close(): Promise<void>;
}

function message(type: string, body: Buffer = Buffer.alloc(0)): Buffer {
  const b = Buffer.alloc(5 + body.length);
  b.write(type, 0, 'latin1');
  b.writeUInt32BE(4 + body.length, 1);
  body.copy(b, 5);
  return b;
}

const cstring = (s: string) => Buffer.from(`${s}\0`, 'utf8');

function errorResponse(severity: 'ERROR' | 'FATAL', code: string): Buffer {
  return message(
    'E',
    Buffer.concat([
      cstring(`S${severity}`),
      cstring(`V${severity}`),
      cstring(`C${code}`),
      cstring('Mfake error'),
      Buffer.from([0]),
    ]),
  );
}

function parameterDescription(count: number): Buffer {
  const body = Buffer.alloc(2 + 4 * count);
  body.writeUInt16BE(count, 0);
  for (let i = 0; i < count; i++) body.writeUInt32BE(25, 2 + 4 * i); // text
  return message('t', body);
}

/**
 * A Postgres server that speaks just enough of the wire protocol (startup without a password, simple queries, the
 * unnamed extended protocol that postgres.js uses with prepare: false) for postgres.js to run queries and
 * transactions against it, and that can drop a connection at a chosen statement. Every query returns no rows.
 * PGlite runs in process, so it cannot show what postgres.js does when its socket closes; this server can.
 */
export async function startFakePg(): Promise<FakePg> {
  const statements: string[] = [];
  const plans: { pattern: RegExp; action: Action }[] = [];
  const sockets = new Set<Socket>();
  let startups = 0;

  const take = (text: string): Action | undefined => {
    const i = plans.findIndex((p) => p.pattern.test(text));
    return i === -1 ? undefined : plans.splice(i, 1)[0].action;
  };

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});

    let buffer = Buffer.alloc(0);
    let started = false;
    let status: 'I' | 'T' | 'E' = 'I';
    let current: { text: string; params: number; action?: Action } = { text: '', params: 0 };
    let failed = false;

    const send = (...parts: Buffer[]) => socket.write(Buffer.concat(parts));
    const ready = () => message('Z', Buffer.from(status));
    const complete = (text: string): Buffer => {
      const verb = /^\s*(\w+)/.exec(text)?.[1].toLowerCase() ?? '';
      if (verb === 'begin') status = 'T';
      if (verb === 'commit' || verb === 'rollback') status = 'I';
      const tag =
        verb === 'begin' || verb === 'commit' || verb === 'rollback'
          ? verb.toUpperCase()
          : verb === 'insert'
            ? 'INSERT 0 1'
            : verb === 'update'
              ? 'UPDATE 1'
              : 'SELECT 0';
      return message('C', cstring(tag));
    };
    const fail = (code: string): Buffer => {
      if (status === 'T') status = 'E';
      return errorResponse('ERROR', code);
    };
    const failure = (action: Action | undefined) =>
      typeof action === 'object' && 'error' in action ? action.error : null;
    /** Drops the connection instead of answering, for 'end', 'reset' and { fatal }; true when it did. */
    const drop = (action: Action | undefined): boolean => {
      if (action === 'end') socket.end();
      else if (action === 'reset') socket.resetAndDestroy();
      else if (typeof action === 'object' && 'fatal' in action) socket.end(errorResponse('FATAL', action.fatal));
      else return false;
      return true;
    };
    /** Drops the connection after the answer, for 'end-after' and { fatalAfter }. */
    const later = (action: Action | undefined) => {
      if (action === 'end-after') setTimeout(() => socket.end(), 20);
      if (typeof action === 'object' && 'fatalAfter' in action) {
        const code = action.fatalAfter;
        setTimeout(() => socket.end(errorResponse('FATAL', code)), 20);
      }
    };

    /** Handles one frontend message; false once the connection is dropped. */
    const handle = (type: string, body: Buffer): boolean => {
      switch (type) {
        case 'Q': {
          const text = body.toString('utf8', 0, body.length - 1);
          statements.push(text);
          const action = take(text);
          if (drop(action)) return false;
          const code = failure(action);
          send(code === null ? complete(text) : fail(code), ready());
          later(action);
          return true;
        }
        case 'P': {
          const nameEnd = body.indexOf(0);
          const textEnd = body.indexOf(0, nameEnd + 1);
          const text = body.toString('utf8', nameEnd + 1, textEnd);
          statements.push(text);
          const action = take(text);
          if (drop(action)) return false;
          current = { text, params: body.readUInt16BE(textEnd + 1), action };
          failed = false;
          send(message('1'));
          return true;
        }
        case 'D':
          if (!failed)
            send(...(body[0] === 0x53 ? [parameterDescription(current.params), message('n')] : [message('n')]));
          return true;
        case 'B':
          if (!failed) send(message('2'));
          return true;
        case 'E': {
          if (failed) return true;
          const code = failure(current.action);
          if (code === null) send(complete(current.text));
          else {
            failed = true;
            send(fail(code));
          }
          return true;
        }
        case 'S': {
          const action = current.action;
          failed = false;
          current = { text: '', params: 0 };
          send(ready());
          later(action);
          return true;
        }
        case 'X':
          socket.end();
          return false;
        default:
          return true; // Flush and anything else needs no answer
      }
    };

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!started) {
        if (buffer.length < 4 || buffer.length < buffer.readUInt32BE(0)) return;
        buffer = buffer.subarray(buffer.readUInt32BE(0));
        started = true;
        startups++;
        send(message('R', Buffer.alloc(4)), ready()); // AuthenticationOk
      }
      while (buffer.length >= 5) {
        const length = buffer.readUInt32BE(1);
        if (buffer.length < length + 1) return;
        const type = String.fromCharCode(buffer[0]);
        const body = buffer.subarray(5, length + 1);
        buffer = buffer.subarray(length + 1);
        if (!handle(type, body)) return;
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the fake server has no port');

  return {
    url: `postgres://u:p@127.0.0.1:${address.port}/db`,
    statements,
    startups: () => startups,
    once: (pattern, action) => {
      plans.push({ pattern, action });
    },
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
