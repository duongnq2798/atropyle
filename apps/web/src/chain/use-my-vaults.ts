'use client';

import { skipToken, type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address } from 'viem';
import { CHAIN_ID, failedEmpty, sdkQuery } from './hooks';
import type { MyVaults } from './impl/my-vaults';
import { chainKeys } from './keys';
import { loadChainImpl } from './load';
import { useChainSettings } from './provider';

/** Its own key, under the chain's prefix, so keys.ts (in the shell) stays as it is. Addresses lowercased (keys.ts). */
export function myVaultsKey(account: string) {
  return [...chainKeys.all(CHAIN_ID), 'myVaults', account.toLowerCase()] as const;
}

/**
 * The vaults that name `account`, for /me/. A module of its own, like use-sdk.ts: the shell loads hooks.ts on every
 * page, and a useQuery there brought TanStack's query observer into the first load of / and of every page (7B T4,
 * R23; test/build/first-load.test.ts holds it). Refreshed every 60 s and when the tab comes back, once it has data;
 * a read that failed before it had any waits for the page's Retry (failedEmpty). No placeholder: under a new account
 * `data` is undefined, so the page never shows the previous wallet's vaults (Quyết định 18).
 */
export function useMyVaults(account: Address | null): UseQueryResult<MyVaults> {
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  return useQuery({
    queryKey: myVaultsKey(account ?? ''),
    queryFn: account
      ? async () => {
          // As sdkFor of hooks.ts: a chunk that failed to load or a broken deployment becomes this read's error.
          const sdk = await client.query({ ...sdkQuery(crossCheck), retry: false });
          const impl = await loadChainImpl();
          return impl.myVaults(sdk, account);
        }
      : skipToken,
    refetchInterval: (q) => (failedEmpty(q) ? false : 60_000),
    refetchOnWindowFocus: (q) => !failedEmpty(q),
    structuralSharing: false,
  });
}
