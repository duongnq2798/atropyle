'use client';

import { type ReactNode, useId } from 'react';
import { ConnectSheetSlot } from '@/wallet/connect-sheet-slot';
import { NetworkBannerSlot } from '@/wallet/network-banner-slot';
import { Footer } from './footer';
import { Header } from './header';
import { LoadNotice } from './load-notice';
import { ProofLine } from './proof-line';
import { SkipLink } from './skip-link';
import { useWarmOverlays } from './warm-overlays';
// The Thread in the shell's chunk, once (7C T6, ruling R33): the 404 boundary (app/not-found.tsx), whose chunk every
// page loads, draws it, and so do the pages (the home stage, the vault). Turbopack does not count the not-found
// boundary's modules as loaded for a page's own chunk, so without this import `/` carried the Thread, its geometry
// and its colours twice (4.6 kB gzip). test/build/first-load.test.ts holds it to one copy.
import '@/thread/thread';

/**
 * Every page. The skip button comes first for the keyboard (WCAG 2.4.1; hidden until focused), then the proof line,
 * the first thing anyone sees (R18.7), then the sticky header, the live regions of the wrong-network banner and
 * of a failed load, the page and the footer. The overlays of the shell load when the page is idle.
 */
export function Frame({ children }: { children: ReactNode }) {
  const mainId = useId();
  useWarmOverlays();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink targetId={mainId} />
      <ProofLine />
      <Header />
      <NetworkBannerSlot />
      <LoadNotice />
      <main id={mainId} tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
      <Footer />
      <ConnectSheetSlot />
    </div>
  );
}
