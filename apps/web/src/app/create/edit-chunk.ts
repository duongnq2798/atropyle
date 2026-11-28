'use client';

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { inOwnTask, lazyChunk } from '@/lib/lazy-chunk';
import type * as Steps from './steps';

export type StepsModule = typeof Steps;

/** Steps two to five (Ruling 19): out of the first load, loaded at once beside the flow chunk. */
export const stepsChunk = lazyChunk<StepsModule>(() => import('./steps'));

export const STEPS_KEY = ['atropyle', 'createSteps'] as const;

/** Like useSendChunk: one load, its error with a Retry, and a page that mounts after the load renders at once. */
export function useStepsChunk(): UseQueryResult<StepsModule> {
  return useQuery({
    queryKey: STEPS_KEY,
    // In a task of its own, not in the commit that hydrates the page (7C-F1, src/lib/lazy-chunk.ts).
    queryFn: inOwnTask(stepsChunk.load),
    initialData: () => stepsChunk.peek() ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
}
