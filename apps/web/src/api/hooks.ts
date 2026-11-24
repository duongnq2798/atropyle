'use client';

import { skipToken, type UseMutationResult, type UseQueryResult, useMutation, useQuery } from '@tanstack/react-query';
import { CHAIN_ID } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
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

/** Counts for the home page; the backend caches them 60 s (spec §9.2). Idle without a backend. */
export function useApiStats(): UseQueryResult<StatsResponse> {
  const api = getApi();
  return useQuery({
    queryKey: chainKeys.stats(CHAIN_ID, 'api'),
    queryFn: api ? ({ signal }) => api.stats(signal) : skipToken,
    staleTime: 60_000,
  });
}

/**
 * The vaults where `account` has a role, from the backend's index (spec §5.6). The page still reads each vault on the
 * chain before it shows a state. Idle without a backend or a valid address.
 */
export function useMe(account: string | null): UseQueryResult<MeResponse> {
  const api = getApi();
  return useQuery({
    queryKey: chainKeys.me(CHAIN_ID, account ?? ''),
    queryFn: api && account && isAddressText(account) ? ({ signal }) => api.me(account, signal) : skipToken,
    staleTime: 30_000,
  });
}

/** Indexer lag, the last integrity run and the keeper, for /status/ (spec §5.8). Idle without a backend. */
export function useHealth(): UseQueryResult<HealthResponse> {
  const api = getApi();
  return useQuery({
    queryKey: chainKeys.health(CHAIN_ID),
    queryFn: api ? ({ signal }) => api.health(signal) : skipToken,
    refetchInterval: 30_000,
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
