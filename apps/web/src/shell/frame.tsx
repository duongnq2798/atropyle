'use client';

import { type ReactNode, useId } from 'react';
import { ConnectSheetSlot } from '@/wallet/connect-sheet-slot';
import { NetworkBannerSlot } from '@/wallet/network-banner-slot';
import { Footer } from './footer';
import { Header } from './header';
import { ProofLine } from './proof-line';
import { SkipLink } from './skip-link';

/**
 * Every page. The skip button comes first for the keyboard (WCAG 2.4.1; hidden until focused), then the proof line,
 * the first thing anyone sees (R18.7), then the sticky header, the page and the footer.
 */
export function Frame({ children }: { children: ReactNode }) {
  const mainId = useId();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink targetId={mainId} />
      <ProofLine />
      <Header />
      <NetworkBannerSlot />
      <main id={mainId} tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
      <Footer />
      <ConnectSheetSlot />
    </div>
  );
}
