'use client';

import { Wallet } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { messages as walletText } from '@/messages/wallet.messages';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { useWallet } from './provider';
import { WalletMenu } from './wallet-menu';

/** Connect, a placeholder while a remembered wallet reconnects, or the account with its menu. */
export function WalletButton() {
  const t = useT(walletText);
  const { status, wallet, openSheet } = useWallet();
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
  return (
    <Button
      size="sm"
      variant="primary"
      data-wallet-button=""
      aria-label={connecting ? undefined : t('connect')}
      loading={connecting}
      onClick={openSheet}
      icon={<Wallet aria-hidden="true" strokeWidth={1.5} />}
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
