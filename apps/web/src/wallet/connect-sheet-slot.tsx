'use client';

import { lazyChunk, useChunk } from '@/lib/lazy-chunk';
import { useWallet } from './provider';

/**
 * The wallet sheet's own chunk (ruling R23): the dialog, the wallet list and, inside them, the QR code stay out of
 * every page's first load. WalletButton preloads it on pointerenter and focus, so the first open has no wait.
 */
export const connectSheet = lazyChunk(() => import('./connect-sheet'));

/**
 * Where Frame mounts the wallet sheet: nothing until `openSheet()` first opens it, then the sheet, which stays
 * mounted. A chunk that fails to load (offline, a new deploy) closes the sheet again, so the next press retries.
 */
export function ConnectSheetSlot() {
  const { sheetOpen, setSheetOpen } = useWallet();
  const loaded = useChunk(connectSheet, sheetOpen, () => setSheetOpen(false));
  return loaded ? <loaded.ConnectSheet /> : null;
}
