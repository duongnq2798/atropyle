'use client';

import {
  skipToken,
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { CHAIN_ID, failedEmpty } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
import { errorCode } from '@/chain/query-client';
import { isAddressText } from '@/lib/address';
import { type ApiClient, ApiError } from './client';
import { getApi } from './instance';
import type { ConfirmResponse, HealthResponse, MeResponse, OkResponse, StatsResponse, SubscribeRequest } from './types';

/** For forms, which the deweb build does not show (spec §5.7); a call there fails as UNAVAILABLE. */
function requireApi(): ApiClient {
  const api = getApi();
  if (!api) throw new ApiError('UNAVAILABLE', null, 'This build has no backend.');
  return api;
}

/**
 * The retry of the backend's GETs: the client's own (makeQueryClient: shouldRetry), except for a TIMEOUT. A backend
 * that hangs would hang again, and three 10 s timeouts and their backoff kept the home page's spinner up for about
 * 33 s before the chain fallback (spec §2).
 */
function useRetryUnlessTimeout(): (failures: number, error: Error) => boolean {
  const base = useQueryClient().getDefaultOptions().queries?.retry;
  return (failures, error) => {
    if (errorCode(error) === 'TIMEOUT') return false;
    if (typeof base === 'function') return base(failures, error);
    if (typeof base === 'number') return failures < base;
    // TanStack's own default in a browser: three retries.
    return base ?? failures < 3;
  };
}

/** Counts for the home page; the backend caches them 60 s (spec §9.2). Idle without a backend. */
export function useApiStats(): UseQueryResult<StatsResponse> {
  const api = getApi();
  const retry = useRetryUnlessTimeout();
  return useQuery({
    queryKey: chainKeys.stats(CHAIN_ID, 'api'),
    queryFn: api ? ({ signal }) => api.stats(signal) : skipToken,
    staleTime: 60_000,
    retry,
    // A failure with nothing shown waits for Retry, as the chain's reads do (failedEmpty).
    refetchOnWindowFocus: (q) => !failedEmpty(q),
  });
}

/**
 * The vaults where `account` has a role, from the backend's index (spec §5.6). The page still reads each vault on the
 * chain before it shows a state. Idle without a backend or a valid address.
 */
export function useMe(account: string | null): UseQueryResult<MeResponse> {
  const api = getApi();
  const retry = useRetryUnlessTimeout();
  return useQuery({
    queryKey: chainKeys.me(CHAIN_ID, account ?? ''),
    queryFn: api && account && isAddressText(account) ? ({ signal }) => api.me(account, signal) : skipToken,
    staleTime: 30_000,
    retry,
    refetchOnWindowFocus: (q) => !failedEmpty(q),
  });
}

/** Indexer lag, the last integrity run and the keeper, for /status/ (spec §5.8). Idle without a backend. */
export function useHealth(): UseQueryResult<HealthResponse> {
  const api = getApi();
  const retry = useRetryUnlessTimeout();
  return useQuery({
    queryKey: chainKeys.health(CHAIN_ID),
    queryFn: api ? ({ signal }) => api.health(signal) : skipToken,
    retry,
    // A backend that is down stays one steady error until Retry, rather than an error and a spinner every 30 s.
    refetchInterval: (q) => (failedEmpty(q) ? false : 30_000),
    refetchOnWindowFocus: (q) => !failedEmpty(q),
  });
}

/** Double opt-in: the answer is the same whether the email is known or not (spec §5.7). Never retried. */
export function useSubscribe(): UseMutationResult<OkResponse, Error, SubscribeRequest> {
  return useMutation({ mutationFn: async (req: SubscribeRequest) => requireApi().subscribe(req) });
}

/** The token comes from `#t=` of /alerts/confirm/, never from a query string (spec §9.6). */
export function useConfirm(): UseMutationResult<ConfirmResponse, Error, string> {
  return useMutation({ mutationFn: async (token: string) => requireApi().confirm(token) });
}

/** Idempotent: an unknown token answers ok as well (spec §9.6). */
export function useUnsubscribe(): UseMutationResult<OkResponse, Error, string> {
  return useMutation({ mutationFn: async (token: string) => requireApi().unsubscribe(token) });
}
