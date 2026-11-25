'use client';

import { LogOut } from 'lucide-react';
import type { RefObject } from 'react';
import { ENV, explorerUrlOf } from '@/config/env';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as walletText } from '@/messages/wallet-overlays.messages';
import { Address } from '@/ui/address';
import { Button } from '@/ui/button';
import { AnchoredPopover, PopoverClose } from '@/ui/popover';
import { UntrustedText } from '@/ui/untrusted-text';
import { networkName } from './network';
import { SwitchNetworkButton } from './network-banner';
import { useWallet } from './provider';

const EXPLORER = explorerUrlOf(ENV);

/**
 * Below sm the menu spans the screen less the collision padding (12 px) on both sides, so it stands centred under the
 * header: at 22rem it hung from the account button and the collision padding pushed it off the button, 12 px from the
 * left edge and 48 px from the right on a 412 px phone. Radix gives that width as
 * --radix-popover-content-available-width, which leaves out a classic scrollbar, unlike 100vw. From sm up it hangs
 * from the button at 22rem. Either way the address keeps its block of two rows of five beside the copy and OKLink
 * buttons (X Layer): "0x" and five groups take 23.8ch, 200 px at text-small, and the row leaves the groups 220 px at
 * 22rem, 204 px on a 360 px phone. At w-80 they got 188 px and the address broke into three ragged lines. Test 1 of
 * e2e/wallet.spec.ts measures the menu's edges, and keeps the 40 px of the OKLink button free on anvil, where the
 * explorer is null.
 */
const WIDTH = 'w-(--radix-popover-content-available-width) sm:w-[22rem]';

/** The content of WalletMenu, in its own chunk: the full address, the network and Disconnect. */
export function WalletMenuPanel({
  id,
  anchor,
  open,
  onOpenChange,
}: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const t = useT(walletText);
  const { wallet, wrongChain, disconnect } = useWallet();
  if (!wallet) return null;
  return (
    <AnchoredPopover
      id={id}
      anchor={anchor}
      open={open}
      onOpenChange={onOpenChange}
      label={t('walletMenu')}
      className={WIDTH}
      onCloseAutoFocus={(event) => {
        // Disconnect, or a wallet that went away, removes this menu together with its button; focus goes to the
        // Connect button that takes its place, not to the page. While connected, focus goes back to the button.
        if (anchor.current?.isConnected) return;
        const next = document.querySelector<HTMLElement>('[data-wallet-button]');
        if (next) {
          event.preventDefault();
          next.focus();
        }
      }}
    >
      <div className="flex flex-col gap-4 p-1">
        <div className="flex flex-col gap-2">
          <p className="text-caption text-ink-muted">
            {t('connectedWith')} <UntrustedText value={wallet.option.name} max={40} className="text-ink" />
          </p>
          <Address address={wallet.account} explorer={EXPLORER} size="sm" />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-small">
          <span className="text-ink-muted">{t('network')}</span>
          <span className={cn('inline-flex items-center gap-1.5', wrongChain ? 'text-grace' : 'text-ink')}>
            <span aria-hidden="true" className={cn('size-2 rounded-full', wrongChain ? 'bg-grace' : 'bg-alive')} />
            {networkName(wallet.chainId)}
            <span className="font-mono text-ink-muted">· {wallet.chainId}</span>
          </span>
        </div>
        {wrongChain ? <SwitchNetworkButton /> : null}
        <div className="flex flex-col items-start gap-1.5 border-line border-t pt-3">
          <PopoverClose asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={disconnect}
              icon={<LogOut aria-hidden="true" strokeWidth={1.5} />}
            >
              {t('disconnect')}
            </Button>
          </PopoverClose>
          <p className="px-1 text-caption text-ink-muted">{t('disconnectHint')}</p>
        </div>
      </div>
    </AnchoredPopover>
  );
}
