import { type Stats, type StatsCursor, toAddress } from '@atropyle/sdk';
import { type KV, readJson, writeJson } from '@/lib/store';

export type StatsSnapshot = Omit<Stats, 'cursor'>;

export interface CachedStats {
  version: 1;
  savedAtMs: number;
  stats: StatsSnapshot;
  cursor: StatsCursor;
}

/** One cache per chain and factory, so a redeploy or another network never mixes counts (plan decision 17). */
export function statsKey(chainId: number, factory: string): string {
  return `atropyle:stats:v1:${chainId}:${factory.toLowerCase()}`;
}

export function toCache(s: Stats, nowMs: number): CachedStats {
  const { cursor, ...stats } = s;
  return { version: 1, savedAtMs: nowMs, stats, cursor };
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
/** writeJson stores bigints as decimal strings (SDK `stringify`). */
const block = (v: unknown): bigint | null => (typeof v === 'string' && /^\d{1,30}$/.test(v) ? BigInt(v) : null);

function counts<K extends string>(o: Obj, keys: readonly K[]): Record<K, number> | null {
  const out = {} as Record<K, number>;
  for (const k of keys) {
    const n = count(o[k]);
    if (n === null) return null;
    out[k] = n;
  }
  return out;
}

/**
 * Rebuilds a cache entry from parsed JSON. This repeats the SDK's stats-cursor parser on purpose: the SDK does not
 * export it, and the web app must reject a damaged entry (and fall back to a full count) instead of resuming from it.
 */
export function reviveCache(raw: unknown): CachedStats | null {
  const o = obj(raw);
  if (o?.version !== 1) return null;
  const savedAtMs = count(o.savedAtMs);
  const s = obj(o.stats);
  const c = obj(o.cursor);
  const v = s ? obj(s.vaults) : null;
  if (savedAtMs === null || !s || !c || !v || !Array.isArray(c.vaults)) return null;
  const fromBlock = block(s.fromBlock);
  const toBlock = block(s.toBlock);
  const cursorTo = block(c.toBlock);
  const top = counts(s, ['owners', 'checkIns', 'alarms', 'releases', 'distributions'] as const);
  const vaults = counts(v, ['total', 'drill', 'paid'] as const);
  const cur = counts(c, ['aliveEvents', 'alarms', 'releases', 'distributions'] as const);
  if (fromBlock === null || toBlock === null || cursorTo === null || !top || !vaults || !cur) return null;
  const list: StatsCursor['vaults'] = [];
  for (const item of c.vaults) {
    const e = obj(item);
    if (!e) return null;
    const { vault, owner, drill } = e;
    if (typeof drill !== 'boolean') return null;
    try {
      list.push({ vault: toAddress(vault, 'vault'), owner: toAddress(owner, 'owner'), drill });
    } catch {
      return null;
    }
  }
  return {
    version: 1,
    savedAtMs,
    stats: { fromBlock, toBlock, vaults, ...top },
    cursor: { toBlock: cursorTo, vaults: list, ...cur },
  };
}

export function loadStats(kv: KV, chainId: number, factory: string): CachedStats | null {
  return readJson(kv, statsKey(chainId, factory), reviveCache);
}

export function saveStats(kv: KV, chainId: number, factory: string, s: Stats, nowMs: number): CachedStats {
  const c = toCache(s, nowMs);
  writeJson(kv, statsKey(chainId, factory), c);
  return c;
}

export type StatTileId = 'vaults' | 'paid' | 'drill' | 'owners' | 'checkIns' | 'alarms' | 'releases' | 'distributions';

export function statsTiles(s: StatsSnapshot): { id: StatTileId; value: number }[] {
  return [
    { id: 'vaults', value: s.vaults.total },
    { id: 'paid', value: s.vaults.paid },
    { id: 'drill', value: s.vaults.drill },
    { id: 'owners', value: s.owners },
    { id: 'checkIns', value: s.checkIns },
    { id: 'alarms', value: s.alarms },
    { id: 'releases', value: s.releases },
    { id: 'distributions', value: s.distributions },
  ];
}
