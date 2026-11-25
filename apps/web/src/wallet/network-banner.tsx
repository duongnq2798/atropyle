'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { errorCode } from '@/chain/query-client';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as walletText } from '@/messages/wallet-overlays.messages';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { InlineError } from '@/ui/inline-error';
import { networkName } from './network';
import { useWallet } from './provider';

/** Asks the wallet to move to this build's chain (adding it first if the wallet does not know it). */
export function SwitchNetworkButton({ className }: { className?: string }) {
  const t = useT(walletText);
  const { switchChain, expectedChainId } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'switchRejected' | 'switchFailed' | null>(null);
  const errorId = useId();
  const expected = networkName(expectedChainId);
  const box = useRef<HTMLDivElement>(null);
  // A switch that worked removes this button (the banner goes, the menu drops the row) and the focus with it. The
  // cleanup runs before React removes the node, so it can tell; once the commit is done, focus goes to the wallet
  // button, whose name now gives the right network, instead of to the page.
  useLayoutEffect(() => {
    const node = box.current;
    return () => {
      if (!node?.contains(document.activeElement)) return;
      queueMicrotask(() => {
        if (document.activeElement !== null && document.activeElement !== document.body) return;
        document.querySelector<HTMLElement>('[data-wallet-button]')?.focus();
      });
    };
  }, []);
  return (
    <div ref={box} className={cn('flex flex-col items-start gap-2', className)}>
      <Button
        size="sm"
        variant="primary"
        loading={busy}
        aria-describedby={error ? errorId : undefined}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await switchChain();
          } catch (e) {
            setError(errorCode(e) === 'USER_REJECTED' ? 'switchRejected' : 'switchFailed');
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('switchNetwork', { expected })}
      </Button>
      {error ? <InlineError id={errorId}>{t(error, { expected })}</InlineError> : null}
    </div>
  );
}

/**
 * Under the header while the wallet is on another chain (Review Focus 3), in the live region that
 * NetworkBannerSlot keeps on every page from the first paint, so a screen reader hears the banner when a wallet
 * event brings it.
 */
export function NetworkBanner() {
  const t = useT(walletText);
  const { wallet, wrongChain, expectedChainId } = useWallet();
  if (wallet === null || !wrongChain) return null;
  return (
    <Banner tone="warn" testId="network-banner" title={t('wrongNetworkTitle')} action={<SwitchNetworkButton />}>
      {t('wrongNetwork', {
        actual: networkName(wallet.chainId),
        expected: networkName(expectedChainId),
        id: expectedChainId,
      })}
    </Banner>
  );
}
