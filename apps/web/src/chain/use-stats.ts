'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useKV } from '@/lib/kv';
import { sdkQuery, useSdk } from './hooks';
import { loadChainImpl } from './load';
import { useChainSettings } from './provider';
import type { CachedStats } from './types';

export interface StatsSummary {
  source: 'api' | 'chain';
  block: bigint;
  vaults: number;
  drills: number;
  checkIns: number;
  /** When this device counted (chain); null when the backend's own time is not a device time. */
  savedAtMs: number | null;
}

export interface StatsState {
  summary: StatsSummary | null;
  progress: { done: number; total: number } | null;
  busy: boolean;
  error: unknown;
  /** Counts from the chain, resuming from the last count on this device. */
  refresh(): void;
}

export function summaryOfCache(c: CachedStats): StatsSummary {
  return {
    source: 'chain',
    block: c.stats.toBlock,
    vaults: c.stats.vaults.total,
    drills: c.stats.vaults.drill,
    checkIns: c.stats.checkIns,
    savedAtMs: c.savedAtMs,
  };
}

/**
 * The count on this device shows at once; reading the chain waits for a button (the factory's logs take many
 * requests on public RPC, 100 blocks per request on X Layer). An SDK that failed to load is the error to show, and
 * the button loads it again.
 */
export function useChainStats(): StatsState {
  const kv = useKV();
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  const sdkResult = useSdk();
  const sdk = sdkResult.data;
  const [cached, setCached] = useState<CachedStats | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** One count at a time: a second press would read every log again from the same cursor. */
  const counting = useRef(false);

  useEffect(() => {
    if (!sdk) return;
    let live = true;
    loadChainImpl().then(
      (impl) => {
        if (live) setCached(impl.cachedStats(sdk, kv));
      },
      () => {
        // The SDK query reports a chunk that failed to load; there is nothing cached to show then.
      },
    );
    return () => {
      live = false;
    };
  }, [sdk, kv]);

  const count = useMutation({
    mutationFn: async () => {
      const s = await client.query(sdkQuery(crossCheck));
      const impl = await loadChainImpl();
      return impl.countStats(s, kv, (done, total) => setProgress({ done, total }));
    },
    onSuccess: (c) => setCached(c),
    onSettled: () => {
      counting.current = false;
      setProgress(null);
    },
  });

  return {
    summary: cached ? summaryOfCache(cached) : null,
    progress,
    busy: count.isPending,
    error: count.error ?? sdkResult.error,
    refresh: () => {
      if (counting.current) return;
      counting.current = true;
      count.mutate();
    },
  };
}

export function useStats(): StatsState {
  return useChainStats();
}
