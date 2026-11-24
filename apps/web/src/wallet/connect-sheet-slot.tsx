'use client';

import { lazyChunk, reportLoadFailure, useChunk } from '@/lib/lazy-chunk';
import { useWallet } from './provider';

/**
 * The wallet sheet's own chunk (ruling R23): the dialog, the wallet list and, inside them, the QR code stay out of
 * every page's first load. Frame preloads it when the page is idle (shell/warm-overlays.ts), and every button that
 * calls `openSheet()` spreads `onPointerEnter` and `onFocus` with `connectSheet.preload`, so the first open has no
 * wait.
 */
export const connectSheet = lazyChunk(() => import('./connect-sheet'));

/**
 * Where Frame mounts the wallet sheet: nothing until `openSheet()` first opens it, then the sheet, which stays
 * mounted. A chunk that fails to load (offline, a new deploy) closes the sheet again and LoadNotice says so; the
 * next press loads again.
 */
export function ConnectSheetSlot() {
  const { sheetOpen, setSheetOpen } = useWallet();
  const loaded = useChunk(connectSheet, sheetOpen, () => {
    setSheetOpen(false);
    reportLoadFailure();
  });
  return loaded ? <loaded.ConnectSheet /> : null;
}
