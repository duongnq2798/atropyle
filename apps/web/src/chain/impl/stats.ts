import type { KV } from '@/lib/store';
import type { Sdk } from './sdk';
import { type CachedStats, loadStats, saveStats } from './stats-view';

export function cachedStats(sdk: Sdk, kv: KV): CachedStats | null {
  return loadStats(kv, sdk.deployment.chainId, sdk.deployment.factory);
}

/** Counts from the chain, resuming from this device's last count (the factory's logs only grow). */
export async function countStats(
  sdk: Sdk,
  kv: KV,
  onProgress?: (done: number, total: number) => void,
): Promise<CachedStats> {
  const s = await sdk.atro.stats({ resume: cachedStats(sdk, kv)?.cursor, onProgress });
  return saveStats(kv, sdk.deployment.chainId, sdk.deployment.factory, s, Date.now());
}
