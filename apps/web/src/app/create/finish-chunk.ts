'use client';

import { skipToken, type UseQueryResult, useQuery } from '@tanstack/react-query';
import { lazyChunk } from '@/lib/lazy-chunk';
import type * as Finish from './finish';

export type FinishModule = typeof Finish;

export const finishChunk = lazyChunk<FinishModule>(() => import('./finish'));

export const FINISH_KEY = ['atropyle', 'createFinish'] as const;

/** Like useSendChunk: one load, its error with a Retry, and a page that mounts after the load renders at once. */
export function useFinishChunk(wanted: boolean): UseQueryResult<FinishModule> {
  return useQuery({
    queryKey: FINISH_KEY,
    queryFn: wanted ? finishChunk.load : skipToken,
    initialData: () => finishChunk.peek() ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
}
