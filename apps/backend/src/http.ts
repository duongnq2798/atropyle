import { stringify } from '@atropyle/sdk';
import type { Config } from './config';
import { errorText, type Log } from './log';

/** The problem codes of spec §9.6. */
export type ProblemCode =
  | 'INVALID_INPUT'
  | 'NOT_A_VAULT'
  | 'RATE_LIMITED'
  | 'TOKEN_INVALID'
  | 'UNAUTHORIZED'
  | 'INTERNAL';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ProblemCode,
    readonly title: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(title);
    this.name = 'HttpError';
  }
}

export const invalid = (title: string) => new HttpError(400, 'INVALID_INPUT', title);

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/** application/problem+json with exactly the shape of spec §9.6. */
export function problem(
  status: number,
  code: ProblemCode,
  title: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status, code }), {
    status,
    headers: { 'content-type': 'application/problem+json; charset=utf-8', ...headers },
  });
}

/** public: GET open to every origin. site: only the web app's origins. none: server-to-server (cron). */
export type Cors = 'public' | 'site' | 'none';

export interface RouteOptions {
  method: 'GET' | 'POST';
  cors: Cors;
  /** Refuse a request whose Origin header is not the site's. Default: true for cors 'site'. */
  strictOrigin?: boolean;
}

export interface RouteDeps {
  config: Pick<Config, 'allowedOrigins'>;
  log: Log;
}

export type Handler<D> = (req: Request, d: D) => Promise<Response>;

function corsHeaders(cors: Cors, origin: string | null, allowed: readonly string[]): Record<string, string> {
  if (cors === 'public') return { 'access-control-allow-origin': '*' };
  if (cors === 'site' && origin !== null && allowed.includes(origin)) {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return cors === 'site' ? { vary: 'Origin' } : {};
}

/**
 * Method check, CORS (spec §9.2: GET open, POST only from the site), error mapping to problem+json.
 * A request without an Origin header is not a browser request (mail clients, pg_net, curl) and passes.
 */
export function route<D extends RouteDeps>(o: RouteOptions, fn: Handler<D>): Handler<D> {
  const strict = o.strictOrigin ?? o.cors === 'site';
  return async (req, d) => {
    const origin = req.headers.get('origin');
    const foreign = strict && origin !== null && !d.config.allowedOrigins.includes(origin);
    const cors = corsHeaders(o.cors, origin, d.config.allowedOrigins);
    const withCors = (r: Response): Response => {
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    };
    if (req.method === 'OPTIONS') {
      if (o.cors === 'none') return problem(405, 'INVALID_INPUT', 'Method not allowed.', { allow: o.method });
      if (foreign) return problem(403, 'UNAUTHORIZED', 'Origin not allowed.');
      return withCors(
        new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-methods': `${o.method}, OPTIONS`,
            'access-control-allow-headers': 'content-type',
            'access-control-max-age': '86400',
          },
        }),
      );
    }
    if (req.method !== o.method) {
      return withCors(problem(405, 'INVALID_INPUT', 'Method not allowed.', { allow: `${o.method}, OPTIONS` }));
    }
    if (foreign) return problem(403, 'UNAUTHORIZED', 'Origin not allowed.');
    try {
      return withCors(await fn(req, d));
    } catch (e) {
      if (e instanceof HttpError) return withCors(problem(e.status, e.code, e.title, e.headers));
      d.log.error('handler failed', { path: new URL(req.url).pathname, error: errorText(e) });
      return withCors(problem(500, 'INTERNAL', 'Something went wrong. Try again later.'));
    }
  };
}

/** A small JSON object body, or 400 INVALID_INPUT. */
export async function readJson(req: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw invalid('The request body is too large.');
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw invalid('The request body is not JSON.');
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw invalid('The request body must be a JSON object.');
  return v as Record<string, unknown>;
}

/** The caller's IP as Supabase's edge forwards it. Only ever used through an HMAC (spec §9.5). */
export function clientIp(req: Request): string {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (first) return first;
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
