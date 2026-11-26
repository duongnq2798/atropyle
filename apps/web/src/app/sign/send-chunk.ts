'use client';

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { lazyChunk } from '@/lib/lazy-chunk';
import type * as Send from './sign-send';

export type SendModule = typeof Send;

/**
 * The half of /sign/ that signs, in a chunk of its own: the typing gates, the runner and TxCard, with the mirror's
 * Radix tooltip and the Receipt. None of it shows before inspect answers, so it stays out of the route's first load
 * (R23: 240 kB), and the page loads it from its first render, beside the SDK and the flow logic.
 */
export const sendChunk = lazyChunk<SendModule>(() => import('./sign-send'));

export const SEND_KEY = ['atropyle', 'signSend'] as const;

/**
 * The chunk as a query, like useFlows (src/flows/use-flows.ts): one load, its error with a Retry, and a page that
 * mounts after the load renders with it at once. It runs while the browser says it is offline: a chunk that cannot
 * load becomes an error the page shows, never a skeleton that waits for ever.
 */
export function useSendChunk(): UseQueryResult<SendModule> {
  return useQuery({
    queryKey: SEND_KEY,
    queryFn: sendChunk.load,
    initialData: () => sendChunk.peek() ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
}
