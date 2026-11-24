'use client';

import { lazyChunk, useChunk } from '@/lib/lazy-chunk';
import { useWallet } from './provider';

/** The banner shows only on the wrong chain, after a wallet connects; its chunk loads then (ruling R23). */
const banner = lazyChunk(() => import('./network-banner'));

/** Where Frame mounts NetworkBanner: nothing until a wallet is first on the wrong chain. */
export function NetworkBannerSlot() {
  const { wrongChain } = useWallet();
  const loaded = useChunk(banner, wrongChain);
  return loaded ? <loaded.NetworkBanner /> : null;
}
