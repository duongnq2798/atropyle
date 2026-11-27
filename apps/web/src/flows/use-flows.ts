'use client';

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { inOwnTask } from '@/lib/lazy-chunk';
import { type FlowsImpl, loadFlowsImpl, peekFlowsImpl } from './load';

export const FLOWS_KEY = ['atropyle', 'flows'] as const;

/**
 * The flow logic chunk as a query: every component shares one load, gets the error and a retry, and a component that
 * mounts after the load renders with it at once. Module objects are never compared structurally. Like sdkQuery
 * (src/chain/hooks.ts), it runs while the browser says it is offline: a chunk at hand still gives the logic, and a
 * chunk that cannot load becomes the error a page shows with its Retry, never a "Preparing…" that waits for ever.
 */
export function useFlows(): UseQueryResult<FlowsImpl> {
  return useQuery({
    queryKey: FLOWS_KEY,
    // In a task of its own, not in the commit that hydrates the page (7C-F1, src/lib/lazy-chunk.ts).
    queryFn: inOwnTask(loadFlowsImpl),
    initialData: () => peekFlowsImpl() ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
}
