'use client';

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { loadTimeMachine, peekTimeMachine, type TimeMachineImpl } from './load';

export const TIME_MACHINE_KEY = ['atropyle', 'time-machine'] as const;

/**
 * The time machine chunk as a query, like useFlows: one load shared by every component, its error and a retry,
 * synchronous for a component that mounts after it. Offline too: a chunk at hand still works, and a chunk that cannot
 * load becomes the error the box shows with its Retry.
 */
export function useTimeMachine(): UseQueryResult<TimeMachineImpl> {
  return useQuery({
    queryKey: TIME_MACHINE_KEY,
    queryFn: loadTimeMachine,
    initialData: () => peekTimeMachine() ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
}
