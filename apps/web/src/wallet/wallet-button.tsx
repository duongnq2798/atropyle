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
import { ACCOUNT_BOX, SHORT_SHOWN, WalletMenu } from './wallet-menu';

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
    // The account button's own box with its face and short address as Skeletons, so the button that replaces it has
    // the same width in every range (spec §6). 20.8ch is compactAddress in the Ledger voice: 19 glyphs and four
    // spaces of 1ch less the 0.55ch of the button's word spacing. The wrappers carry the shape: cn() joins classes
    // without merging, so a Skeleton keeps its own rounded-lg and block.
    return (
      <span role="status" className={ACCOUNT_BOX}>
        <span className="overflow-hidden rounded-full">
          <Skeleton className="size-6" />
        </span>
        <span className={SHORT_SHOWN}>
          <Skeleton className="voice-ledger h-3.5 w-[20.8ch] text-small" />
        </span>
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
      onClick={() => openSheet()}
      onPointerEnter={connectSheet.preload}
      onFocus={connectSheet.preload}
      icon={waiting ? <Spinner size={16} /> : <Wallet aria-hidden="true" strokeWidth={1.5} />}
    >
      {connecting ? (
        t('connecting')
      ) : (
        <>
          {/* The short label below sm, and from md to lg, where the bar nav takes the header's room (parked 7B-T1). */}
          <span className="sm:hidden md:inline lg:hidden">{t('connectShort')}</span>
          <span className="hidden sm:inline md:hidden lg:inline">{t('connect')}</span>
        </>
      )}
    </Button>
  );
}
