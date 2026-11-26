'use client';

import type { VaultSnapshot } from '@atropyle/sdk';
import { skipToken, type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAIN_ID, sdkQuery } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
import { useChainSettings } from '@/chain/provider';
import { failedFirst } from '@/chain/use-my-vaults';

export interface InvitedVault {
  /** The vault's address with its EIP-55 checksum, as the SDK wrote it. */
  address: `0x${string}`;
  snap: VaultSnapshot;
  /** The deployment's factory created it, at the snapshot's block. Its own `factory()` proves nothing. */
  registered: boolean;
}

/** Its own key, exact to the letter: a changed capital is another link, which the SDK may refuse. */
export function invitedVaultKey(raw: string) {
  return [...chainKeys.all(CHAIN_ID), 'invite', raw] as const;
}

/**
 * The vault of an invitation: one snapshot and the registration check at its block. No policy engine and no
 * timeline, which this page does not show, and which a contract the factory did not create could fake. A module of
 * its own, like use-my-vaults.ts: a useQuery in chain/hooks.ts brings TanStack's query observer into the first load
 * of every page (test/build/first-load.test.ts). `sdk.atro.vault(raw)` checks the address first (toAddress), so a
 * changed checksum fails as INVALID_ADDRESS before any request reaches a node. A read that failed before it had data
 * waits for the page's Retry (failedFirst).
 */
export function useInvitedVault(raw: string | null): UseQueryResult<InvitedVault> {
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  return useQuery({
    queryKey: invitedVaultKey(raw ?? ''),
    queryFn: raw
      ? async (): Promise<InvitedVault> => {
          // As sdkFor of hooks.ts: a chunk that failed to load or a broken deployment becomes this read's error.
          const sdk = await client.query({ ...sdkQuery(crossCheck), retry: false });
          const handle = sdk.atro.vault(raw);
          const snap = await handle.snapshot();
          const registered = await handle.registered({ blockNumber: snap.status.blockNumber });
          return { address: handle.address, snap, registered };
        }
      : skipToken,
    refetchInterval: (q) => (failedFirst(q) ? false : 30_000),
    refetchOnWindowFocus: (q) => !failedFirst(q),
    structuralSharing: false,
  });
}
