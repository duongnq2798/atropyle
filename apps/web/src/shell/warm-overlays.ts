import { useEffect } from 'react';
import { whenIdle } from '@/lib/lazy-chunk';
import { connectSheet } from '@/wallet/connect-sheet-slot';
import { walletMenuPanel } from '@/wallet/wallet-menu';
import { menuSheet } from './mobile-menu';
import { settingsPanel } from './settings-menu';

/** The header shows Settings from 48rem (md) and Menu below it (shell/header.tsx). */
const WIDE = '(min-width: 48rem)';

/**
 * Loads the chunks of the shell's overlays once the page is idle after hydration, so the first press opens at
 * once. A phone has no hover: without this, the first tap on Connect or Menu waited for its chunk (about 0.9 and
 * 1 s on a slow 4G line). The chunks stay out of the first load that the R23 budget counts, as the motion features
 * do. Of Settings and Menu, only the one the header shows at this width loads.
 */
export function useWarmOverlays(): void {
  useEffect(
    () =>
      whenIdle(() => {
        connectSheet.preload();
        walletMenuPanel.preload();
        (window.matchMedia(WIDE).matches ? settingsPanel : menuSheet).preload();
      }),
    [],
  );
}
