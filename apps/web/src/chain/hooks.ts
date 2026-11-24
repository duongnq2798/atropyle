'use client';

import type { VaultRef } from '@atropyle/sdk';
import { queryOptions, skipToken, type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query';
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
 * `queryClient.fetchQuery(sdkQuery(crossCheck))`, so a page that never connects never loads the SDK chunk.
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
    retry: false,
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
 * One vault, refreshed every 30 s and when the tab comes back. No placeholder: while another address loads, `data`
 * is undefined, so a page never shows the previous vault under the new address (Quyết định 18).
 */
export function useVault(vault: Address | null): UseQueryResult<LoadedVault> {
  const sdk = useSdk().data;
  return useQuery({
    queryKey: chainKeys.vault(CHAIN_ID, vault ?? ''),
    queryFn:
      sdk && vault
        ? async () => {
            const impl = await loadChainImpl();
            return impl.loadVault(sdk, vault);
          }
        : skipToken,
    refetchInterval: 30_000,
    structuralSharing: false,
  });
}

/** Vaults where `account` has a role, from the factory index, newest first. */
export function useVaultsOf(account: Address | null): UseQueryResult<VaultRef[]> {
  const sdk = useSdk().data;
  return useQuery({
    queryKey: chainKeys.vaultsOf(CHAIN_ID, account ?? ''),
    queryFn:
      sdk && account
        ? async () => {
            const impl = await loadChainImpl();
            return impl.vaultsOf(sdk, account);
          }
        : skipToken,
    refetchInterval: 60_000,
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
