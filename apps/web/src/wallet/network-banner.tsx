'use client';

import { useId, useState } from 'react';
import { errorCode } from '@/chain/query-client';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as walletText } from '@/messages/wallet.messages';
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
  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
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
 * Under the header while the wallet is on another chain (Review Focus 3). The live region is always there, so a
 * screen reader hears the banner when a wallet event brings it.
 */
export function NetworkBanner() {
  const t = useT(walletText);
  const { wallet, wrongChain, expectedChainId } = useWallet();
  const show = wallet !== null && wrongChain;
  return (
    <div aria-live="polite" className={show ? 'mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6' : undefined}>
      {show ? (
        <Banner tone="warn" testId="network-banner" title={t('wrongNetworkTitle')} action={<SwitchNetworkButton />}>
          {t('wrongNetwork', {
            actual: networkName(wallet.chainId),
            expected: networkName(expectedChainId),
            id: expectedChainId,
          })}
        </Banner>
      ) : null}
    </div>
  );
}
