'use client';

import { skipToken, type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address } from 'viem';
import { CHAIN_ID, failedEmpty, sdkFor } from './hooks';
import { chainKeys } from './keys';
import { loadChainImpl } from './load';
import { useChainSettings } from './provider';
import type { LoadedVault } from './types';

export interface VaultQueryOptions {
  /**
   * When to read again, in milliseconds, from the last read and the wall clock. Without it, every 30 s. The vault page
   * reads again just after the next moment the rules change (src/app/vault/boundary.ts).
   */
  refetchMs?(loaded: LoadedVault, nowMs: number): number;
}

/**
 * One vault, refreshed every 30 s (or when `refetchMs` says) and when the tab comes back, once it has data: a read
 * that failed before it had any waits for the page's Retry (failedEmpty). TanStack computes the interval again after
 * every read, so a new read brings a new delay. No placeholder: while another address loads, `data` is undefined,
 * so a page never shows the previous vault under the new address (Quyết định 18).
 *
 * A module of its own, like use-sdk.ts and use-my-vaults.ts: the shell loads hooks.ts on every page, and this
 * useQuery there brought TanStack's query observer into the first load of / once the vault page called it (R23; the
 * merge of Plans 7B and 7C, test/build/first-load.test.ts holds it).
 */
export function useVault(vault: Address | null, o: VaultQueryOptions = {}): UseQueryResult<LoadedVault> {
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  const { refetchMs } = o;
  return useQuery({
    queryKey: chainKeys.vault(CHAIN_ID, vault ?? ''),
    queryFn: vault
      ? async () => {
          const sdk = await sdkFor(client, crossCheck);
          const impl = await loadChainImpl();
          return impl.loadVault(sdk, vault);
        }
      : skipToken,
    refetchInterval: (q) => {
      if (failedEmpty(q)) return false;
      const data = q.state.data;
      return data && refetchMs ? refetchMs(data, Date.now()) : 30_000;
    },
    refetchOnWindowFocus: (q) => !failedEmpty(q),
    structuralSharing: false,
  });
}
