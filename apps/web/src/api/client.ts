import type { Address } from 'viem';
import { isAddressText, sameAddress } from '@/lib/address';
import {
  type ConfirmResponse,
  type HealthResponse,
  type MeResponse,
  type MeVault,
  type OkResponse,
  PROBLEM_CODES,
  type ProblemCode,
  type Role,
  type StatsResponse,
  type SubscribeRequest,
} from './types';

export type ApiErrorCode = ProblemCode | 'NETWORK' | 'TIMEOUT' | 'BAD_RESPONSE' | 'UNAVAILABLE';

/**
 * Every failure of a backend call. The UI words its message by `code` (src/api/errors.ts); `message` names the
 * request and the code for the console. The backend's `title` is left out: it is neither translated nor meant for
 * people, and the page takes no text from the backend.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** The HTTP status, or null when no answer came (network, timeout, an input refused before asking). */
  readonly status: number | null;

  constructor(code: ApiErrorCode, status: number | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ApiClient {
  subscribe(req: SubscribeRequest, signal?: AbortSignal): Promise<OkResponse>;
  confirm(token: string, signal?: AbortSignal): Promise<ConfirmResponse>;
  unsubscribe(token: string, signal?: AbortSignal): Promise<OkResponse>;
  me(address: string, signal?: AbortSignal): Promise<MeResponse>;
  stats(signal?: AbortSignal): Promise<StatsResponse>;
  health(signal?: AbortSignal): Promise<HealthResponse>;
}

export interface ApiClientOptions {
  /** The global fetch by default; tests pass a fake. */
  fetch?: typeof fetch;
  /** Per request, the answer's body included. 10 s by default. */
  timeoutMs?: number;
}

type Obj = Record<string, unknown>;
type Parse<T> = (v: unknown) => T | null;

const MAX_TOKEN = 512;
const MAX_VAULTS = 1000;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A bigint on the wire: a decimal string without sign or leading zero, at most 78 digits (2^256 has 78). */
const isDecimal = (v: unknown): v is string => typeof v === 'string' && /^(?:0|[1-9]\d{0,77})$/.test(v);
const isTime = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
const isAddress = (v: unknown): v is Address => typeof v === 'string' && isAddressText(v);
const isRole = (v: unknown): v is Role => v === 'owner' || v === 'guardian' || v === 'heir';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
/** SDK state names are camelCase words; anything else is refused rather than shown. */
const isStateName = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z]{1,32}$/.test(v);
const isProblemCode = (v: unknown): v is ProblemCode =>
  typeof v === 'string' && (PROBLEM_CODES as readonly string[]).includes(v);

const okOf: Parse<OkResponse> = (v) => (isObj(v) && v.ok === true ? { ok: true } : null);

const confirmOf: Parse<ConfirmResponse> = (v) =>
  isObj(v) && v.ok === true && isAddress(v.vault) && isRole(v.role) ? { ok: true, vault: v.vault, role: v.role } : null;

function meVaultOf(v: unknown): MeVault | null {
  if (!isObj(v) || !isAddress(v.vault) || !Array.isArray(v.roles)) return null;
  const roles = v.roles.filter(isRole);
  if (roles.length === 0 || roles.length !== v.roles.length) return null;
  if (typeof v.drill !== 'boolean' || typeof v.released !== 'boolean' || !isStateName(v.state)) return null;
  return { vault: v.vault, roles: [...new Set(roles)], drill: v.drill, state: v.state, released: v.released };
}

const meOf: Parse<MeResponse> = (v) => {
  if (!isObj(v) || !isAddress(v.address) || !isDecimal(v.block)) return null;
  if (!Array.isArray(v.vaults) || v.vaults.length > MAX_VAULTS) return null;
  const vaults: MeVault[] = [];
  for (const raw of v.vaults) {
    const one = meVaultOf(raw);
    if (!one) return null;
    vaults.push(one);
  }
  return { address: v.address, block: v.block, vaults };
};

const statsOf: Parse<StatsResponse> = (v) =>
  isObj(v) &&
  isDecimal(v.block) &&
  isDecimal(v.vaults) &&
  isDecimal(v.drills) &&
  isDecimal(v.checkIns) &&
  isTime(v.updatedAt)
    ? { block: v.block, vaults: v.vaults, drills: v.drills, checkIns: v.checkIns, updatedAt: v.updatedAt }
    : null;

const indexerOf: Parse<HealthResponse['indexer']> = (v) =>
  isObj(v) && isDecimal(v.block) && isCount(v.lagBlocks) && isTime(v.updatedAt)
    ? { block: v.block, lagBlocks: v.lagBlocks, updatedAt: v.updatedAt }
    : null;

const integrityOf: Parse<NonNullable<HealthResponse['integrity']>> = (v) =>
  isObj(v) && isTime(v.at) && isDecimal(v.block) && typeof v.ok === 'boolean'
    ? { at: v.at, block: v.block, ok: v.ok }
    : null;

const keeperOf: Parse<NonNullable<HealthResponse['keeper']>> = (v) =>
  isObj(v) && isTime(v.lastRunAt) && isDecimal(v.balanceWei) && typeof v.dryRun === 'boolean'
    ? { lastRunAt: v.lastRunAt, balanceWei: v.balanceWei, dryRun: v.dryRun }
    : null;

/** null stays null (that part has not run yet); anything else must parse, or `undefined` refuses the answer. */
function nullable<T>(v: unknown, parse: Parse<T>): T | null | undefined {
  if (v === null) return null;
  return parse(v) ?? undefined;
}

const healthOf: Parse<HealthResponse> = (v) => {
  if (!isObj(v)) return null;
  const indexer = indexerOf(v.indexer);
  const integrity = nullable(v.integrity, integrityOf);
  const keeper = nullable(v.keeper, keeperOf);
  return indexer && integrity !== undefined && keeper !== undefined ? { indexer, integrity, keeper } : null;
};

function problemOf(v: unknown): ProblemCode | null {
  return isObj(v) && isProblemCode(v.code) ? v.code : null;
}

/**
 * The code of an error answer that carries no problem of the contract: a gateway's own throttle or timeout (Supabase
 * answers with its own JSON) is worded as what it is, and retried or not as that; any other 4xx breaks the contract.
 */
function statusCode(status: number): ApiErrorCode {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 408 || status === 504) return 'TIMEOUT';
  return status >= 500 ? 'INTERNAL' : 'BAD_RESPONSE';
}

function jsonOf(text: string): unknown {
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * The backend of spec §9.6 at `base` (`https://<project>.supabase.co/functions/v1`). Every answer is checked against
 * the contract and rebuilt from its known fields only; a cancelled `signal` rejects with the abort error itself, so
 * TanStack Query sees a cancellation rather than a failure.
 */
export function createApiClient(base: string, o: ApiClientOptions = {}): ApiClient {
  const root = base.replace(/\/+$/, '');
  // Called bare: the browser's fetch throws when called as a method of another object (the options here).
  const send: (url: string, init: RequestInit) => Promise<Response> = o.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = o.timeoutMs ?? 10_000;

  async function call<T>(
    method: 'GET' | 'POST',
    path: string,
    body: object | null,
    parse: Parse<T>,
    outer?: AbortSignal,
  ): Promise<T> {
    // No query string in messages: `me` carries an address.
    const what = `${method} /${path.split('?')[0]}`;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const forward = () => ctrl.abort(outer?.reason);
    if (outer?.aborted) forward();
    else outer?.addEventListener('abort', forward, { once: true });
    let res: Response;
    let text: string;
    try {
      res = await send(`${root}/${path}`, {
        method,
        // A GET with only `accept` is a simple CORS request, so it needs no preflight (spec §9.2 opens GET to all).
        headers: body
          ? { accept: 'application/json', 'content-type': 'application/json' }
          : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: ctrl.signal,
      });
      text = await res.text();
    } catch (e) {
      if (timedOut) throw new ApiError('TIMEOUT', null, `${what} took longer than ${timeoutMs} ms`);
      if (outer?.aborted) throw e;
      throw new ApiError('NETWORK', null, `${what} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forward);
    }
    const json = jsonOf(text);
    if (!res.ok) {
      const code = problemOf(json);
      if (code) throw new ApiError(code, res.status, `${what}: ${code} (HTTP ${res.status})`);
      throw new ApiError(statusCode(res.status), res.status, `${what}: HTTP ${res.status}`);
    }
    const value = parse(json);
    if (value === null)
      throw new ApiError('BAD_RESPONSE', res.status, `${what}: the answer does not match the contract`);
    return value;
  }

  const refuse = (code: ApiErrorCode, message: string): Promise<never> =>
    Promise.reject(new ApiError(code, null, message));
  const badToken = (t: string) => t.length === 0 || t.length > MAX_TOKEN;

  return {
    subscribe: (req, signal) =>
      call(
        'POST',
        'subscribe',
        { email: req.email, vault: req.vault, role: req.role, lang: req.lang, website: req.website },
        okOf,
        signal,
      ),
    confirm: (token, signal) =>
      badToken(token)
        ? refuse('TOKEN_INVALID', 'The link carries no valid token.')
        : call('POST', 'confirm', { token }, confirmOf, signal),
    unsubscribe: (token, signal) =>
      badToken(token)
        ? refuse('TOKEN_INVALID', 'The link carries no valid token.')
        : call('POST', 'unsubscribe', { token }, okOf, signal),
    me: (address, signal) => {
      if (!isAddressText(address)) return refuse('INVALID_INPUT', 'me needs an address.');
      const forAddress: Parse<MeResponse> = (v) => {
        const m = meOf(v);
        return m && sameAddress(m.address, address) ? m : null;
      };
      return call('GET', `me?address=${encodeURIComponent(address)}`, null, forAddress, signal);
    },
    stats: (signal) => call('GET', 'stats', null, statsOf, signal),
    health: (signal) => call('GET', 'health', null, healthOf, signal),
  };
}
