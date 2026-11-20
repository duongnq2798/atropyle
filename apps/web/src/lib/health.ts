import { AtropyleError } from '@atropyle/sdk';

/** GET /health of the Worker (Plan 5 Task 8). Only the Pages copy reads it; the DeWEB copy never does (spec section 14). */
export interface Health {
  schemaVersion: 1;
  status: 'ok' | 'degraded';
  rpcs: { url: string; ok: boolean; ms: number | null }[];
  lastCronAt: string | null;
  lastCronAgeSec: number | null;
  cursorLagBlocks: number | null;
  integrity: 'pass' | 'fail' | 'unknown';
  keeper: { address: string | null; balance: string | null; dryRun: boolean };
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_RPCS = 16;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isNumberOrNull = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v));

/** The body comes from a server: keep only the fields of the contract, or return null when the shape is wrong. */
export function parseHealth(raw: unknown): Health | null {
  if (!isObject(raw) || raw.schemaVersion !== 1) return null;
  const { status, rpcs, lastCronAt, lastCronAgeSec, cursorLagBlocks, integrity, keeper } = raw;
  if (status !== 'ok' && status !== 'degraded') return null;
  if (integrity !== 'pass' && integrity !== 'fail' && integrity !== 'unknown') return null;
  if (!Array.isArray(rpcs) || !isStringOrNull(lastCronAt)) return null;
  if (!isNumberOrNull(lastCronAgeSec) || !isNumberOrNull(cursorLagBlocks)) return null;
  if (!isObject(keeper) || !isStringOrNull(keeper.address) || !isStringOrNull(keeper.balance)) return null;
  if (typeof keeper.dryRun !== 'boolean') return null;
  const list: Health['rpcs'] = [];
  for (const r of rpcs.slice(0, MAX_RPCS)) {
    if (!isObject(r) || typeof r.url !== 'string' || typeof r.ok !== 'boolean' || !isNumberOrNull(r.ms)) return null;
    list.push({ url: r.url, ok: r.ok, ms: r.ms });
  }
  return {
    schemaVersion: 1,
    status,
    rpcs: list,
    lastCronAt,
    lastCronAgeSec,
    cursorLagBlocks,
    integrity,
    keeper: { address: keeper.address, balance: keeper.balance, dryRun: keeper.dryRun },
  };
}

export async function fetchHealth(
  workerUrl: string,
  fetchFn: FetchFn = (input, init) => fetch(input, init),
  timeoutMs = 5_000,
): Promise<Health> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${workerUrl}/health`, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new AtropyleError('UNKNOWN', { message: `The Worker answered HTTP ${res.status}.` });
    const health = parseHealth(await res.json());
    if (!health) throw new AtropyleError('UNKNOWN', { message: 'The Worker answered with an unexpected body.' });
    return health;
  } finally {
    clearTimeout(timer);
  }
}
