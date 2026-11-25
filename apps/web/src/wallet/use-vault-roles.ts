'use client';

import type { Role } from '@atropyle/sdk';
import { useMemo } from 'react';
import { peekChainImpl } from '@/chain/load';
import type { LoadedVault } from '@/chain/types';
import { useWallet } from './provider';

/**
 * The connected account's roles in a loaded vault: null until the vault has loaded, [] without a wallet. Computed in
 * render (a vault in the cache means the chain impl has loaded), so a wallet event changes the roles in the same frame.
 */
export function useVaultRoles(loaded: LoadedVault | undefined): readonly Role[] | null {
  const { wallet } = useWallet();
  const account = wallet?.account ?? null;
  return useMemo(() => {
    const impl = peekChainImpl();
    return loaded && impl ? impl.rolesIn(loaded.snap, account) : null;
  }, [loaded, account]);
}
