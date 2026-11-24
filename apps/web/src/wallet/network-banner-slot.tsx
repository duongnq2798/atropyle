'use client';

import { useEffect, useState } from 'react';
import { lazyChunk, useChunk } from '@/lib/lazy-chunk';
import { useWallet } from './provider';

/** The banner shows only on the wrong chain, after a wallet connects; its chunk loads then (ruling R23). */
export const networkBanner = lazyChunk(() => import('./network-banner'));

/** After a failed load, the next try waits this long, doubling up to a minute, unless the browser comes back online. */
const RETRY_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/**
 * Where Frame mounts NetworkBanner (Review Focus 3). The live region is part of every page from the first paint,
 * and the banner, loaded on the first wrong chain, enters it: a live region that arrives already filled is not
 * reliably read out. The banner is the main warning of a wrong network, so a chunk that fails to load is tried
 * again, after a wait or when the browser is back online, while the wallet stays on the wrong chain.
 */
export function NetworkBannerSlot() {
  const { wallet, wrongChain } = useWallet();
  const show = wallet !== null && wrongChain;
  const [failures, setFailures] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const loaded = useChunk(networkBanner, show && !waiting, () => {
    setFailures((n) => n + 1);
    setWaiting(true);
  });
  useEffect(() => {
    if (!waiting) return;
    const again = () => setWaiting(false);
    const timer = window.setTimeout(again, Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** (failures - 1)));
    window.addEventListener('online', again);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', again);
    };
  }, [waiting, failures]);
  const visible = show && loaded !== null;
  return (
    <div aria-live="polite" className={visible ? 'mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6' : undefined}>
      {visible ? <loaded.NetworkBanner /> : null}
    </div>
  );
}
