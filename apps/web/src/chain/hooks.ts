'use client';

import type { VaultRef } from '@atropyle/sdk';
import {
  type QueryClient,
  queryOptions,
  skipToken,
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Address } from 'viem';
import { chainIdOf, ENV } from '@/config/env';
import { chainKeys } from './keys';
import { loadChainImpl } from './load';
import { useChainSettings } from './provider';
import type { LoadedVault, Sdk } from './types';

export const CHAIN_ID: number = chainIdOf(ENV);

/**
 * The query behind useSdk. Code that needs the SDK only on demand (the wallet, when it switches chain) calls
 * `queryClient.query(sdkQuery(crossCheck))`, so a page that never connects never loads the SDK chunk.
 */
export function sdkQuery(crossCheck: boolean) {
  return queryOptions({
    queryKey: chainKeys.sdk(CHAIN_ID, crossCheck),
    queryFn: async (): Promise<Sdk> => {
      const impl = await loadChainImpl();
      return impl.createSdk(impl.loadDeployment(ENV), ENV.target, crossCheck);
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    // No `retry` of its own: the client's policy tries a chunk that failed to load again, a broken deployment never.
    refetchOnWindowFocus: false,
    structuralSharing: false,
  });
}

/** The SDK client of this build's deployment, created once per cross-check setting. */
export function useSdk(): UseQueryResult<Sdk> {
  const { crossCheck } = useChainSettings();
  return useQuery(sdkQuery(crossCheck));
}

/**
 * The SDK for a read, inside the read's own query: a chunk that failed to load or a broken deployment becomes the
 * read's error, which the page shows with its Retry. No retry of its own here, so the read's policy is the only one.
 */
function sdkFor(client: QueryClient, crossCheck: boolean): Promise<Sdk> {
  return client.query({ ...sdkQuery(crossCheck), retry: false });
}

/**
 * A read that failed before it had any data waits for the user's Retry. Polling it, or reading it again when the
 * tab comes back, would only swap the error for a loading state and back (a screen reader announces it each time),
 * and a permanent error comes back the same (Quyết định 18). A read that has data keeps refreshing. The backend's
 * reads (src/api/hooks.ts) follow the same rule.
 */
export function failedEmpty(q: { state: { data: unknown; status: string } }): boolean {
  return q.state.data === undefined && q.state.status === 'error';
}

/**
 * One vault, refreshed every 30 s and when the tab comes back. No placeholder: while another address loads, `data`
 * is undefined, so a page never shows the previous vault under the new address (Quyết định 18).
 */
export function useVault(vault: Address | null): UseQueryResult<LoadedVault> {
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  return useQuery({
    queryKey: chainKeys.vault(CHAIN_ID, vault ?? ''),
    queryFn: vault
      ? async () => {
          const sdk = await sdkFor(client, crossCheck);
          const impl = await loadChainImpl();
          return impl.loadVault(sdk, vault);
        }
      : skipToken,
    refetchInterval: (q) => (failedEmpty(q) ? false : 30_000),
    refetchOnWindowFocus: (q) => !failedEmpty(q),
    structuralSharing: false,
  });
}

/** Vaults where `account` has a role, from the factory index, newest first. */
export function useVaultsOf(account: Address | null): UseQueryResult<VaultRef[]> {
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  return useQuery({
    queryKey: chainKeys.vaultsOf(CHAIN_ID, account ?? ''),
    queryFn: account
      ? async () => {
          const sdk = await sdkFor(client, crossCheck);
          const impl = await loadChainImpl();
          return impl.vaultsOf(sdk, account);
        }
      : skipToken,
    refetchInterval: (q) => (failedEmpty(q) ? false : 60_000),
    refetchOnWindowFocus: (q) => !failedEmpty(q),
    structuralSharing: false,
  });
}

/** After a transaction confirms: read the vault again now instead of at the next interval. */
export function useInvalidateVault(): (vault: string) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    (vault: string) => client.invalidateQueries({ queryKey: chainKeys.vault(CHAIN_ID, vault) }),
    [client],
  );
}
