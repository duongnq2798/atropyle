'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useApiStats } from '@/api/hooks';
import type { StatsResponse } from '@/api/types';
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
  /** The backend's count is on its way and nothing shows yet (vercel build only). */
  loading: boolean;
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

/** The backend's numbers (spec §9.6: decimal strings) as a summary. */
export function summaryOfApi(s: StatsResponse): StatsSummary {
  return {
    source: 'api',
    block: BigInt(s.block),
    vaults: Number(s.vaults),
    drills: Number(s.drills),
    checkIns: Number(s.checkIns),
    savedAtMs: null,
  };
}

/** The count at the higher block; on a tie the one this device made from the chain itself. */
export function freshest(a: StatsSummary | null, b: StatsSummary | null): StatsSummary | null {
  if (!a) return b;
  if (!b) return a;
  if (a.block !== b.block) return a.block > b.block ? a : b;
  return a.source === 'chain' ? a : b;
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
    loading: false,
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

/**
 * The backend's count first on the vercel build; this device's own count wins when it is at a later block, and
 * "count from the chain" works on both builds (spec §2: the site keeps working when the backend is down). A backend
 * failure shows only while there is nothing to show.
 */
export function useStats(): StatsState {
  const chain = useChainStats();
  const api = useApiStats();
  // A backend that has not indexed yet answers block 0 with zero counts: no count, rather than zeros.
  const fromApi = api.data && api.data.block !== '0' ? summaryOfApi(api.data) : null;
  const summary = freshest(fromApi, chain.summary);
  return {
    ...chain,
    summary,
    loading: summary === null && api.isLoading,
    error: chain.error ?? (summary === null ? api.error : null),
  };
}
