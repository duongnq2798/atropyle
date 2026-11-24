'use client';

import { Wallet } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { useChunk } from '@/lib/lazy-chunk';
import { messages as walletText } from '@/messages/wallet.messages';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { Spinner } from '@/ui/spinner';
import { connectSheet } from './connect-sheet-slot';
import { useWallet } from './provider';
import { WalletMenu } from './wallet-menu';

/**
 * Connect, a placeholder while a remembered wallet reconnects, or the account with its menu. While a press waits
 * for the wallet sheet's chunk, Connect shows a spinner and aria-busy, and stays enabled, so focus stays on it.
 */
export function WalletButton() {
  const t = useT(walletText);
  const { status, wallet, openSheet, sheetOpen } = useWallet();
  // The same load as ConnectSheetSlot's (lazyChunk loads once); only the slot handles a failure.
  const sheet = useChunk(connectSheet, sheetOpen && wallet === null);
  if (wallet) return <WalletMenu />;
  if (status === 'restoring') {
    return (
      <span role="status" className="inline-flex overflow-hidden rounded-full">
        <Skeleton className="h-8 w-24 sm:w-44" />
        <span className="sr-only">{t('restoring')}</span>
      </span>
    );
  }
  const connecting = status === 'connecting';
  const waiting = sheetOpen && sheet === null;
  return (
    <Button
      size="sm"
      variant="primary"
      data-wallet-button=""
      aria-label={connecting ? undefined : t('connect')}
      loading={connecting}
      aria-busy={waiting || undefined}
      onClick={openSheet}
      onPointerEnter={connectSheet.preload}
      onFocus={connectSheet.preload}
      icon={waiting ? <Spinner size={16} /> : <Wallet aria-hidden="true" strokeWidth={1.5} />}
    >
      {connecting ? (
        t('connecting')
      ) : (
        <>
          <span className="sm:hidden">{t('connectShort')}</span>
          <span className="hidden sm:inline">{t('connect')}</span>
        </>
      )}
    </Button>
  );
}
