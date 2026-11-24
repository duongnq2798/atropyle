'use client';

import { useT } from '@/i18n/provider';
import { compactAddress } from '@/lib/address';
import { lazyChunk } from '@/lib/lazy-chunk';
import { messages as walletText } from '@/messages/wallet.messages';
import { Avatar } from '@/ui/avatar';
import { useLazyOverlay } from '@/ui/lazy-overlay';
import { useWallet } from './provider';

/** The menu loads on the first hover, focus or press of the account button (ruling R23). */
const panel = lazyChunk(() => import('./wallet-menu-panel'));

/**
 * The connected account: a short form on the button (the full address is one click away, Task 5 `compactAddress`),
 * the full address, the network and Disconnect in the menu.
 */
export function WalletMenu() {
  const t = useT(walletText);
  const { wallet, wrongChain } = useWallet();
  const { open, setOpen, id, anchor, trigger, content } = useLazyOverlay(panel);
  if (!wallet) return null;
  const short = compactAddress(wallet.account);
  return (
    <>
      <button
        {...trigger}
        type="button"
        data-wallet-button=""
        aria-label={t(wrongChain ? 'accountButtonWrong' : 'accountButton', { account: short })}
        className="relative inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface-1 pr-1.5 pl-1.5 text-small transition-colors duration-150 hover:bg-surface-2 sm:pr-3"
      >
        <Avatar address={wallet.account} size={24} />
        <span translate="no" className="hidden font-mono tabular-nums sm:inline">
          {short}
        </span>
        {wrongChain ? (
          <span
            aria-hidden="true"
            className="-top-0.5 -right-0.5 absolute size-2.5 rounded-full bg-grace ring-2 ring-bg"
          />
        ) : null}
      </button>
      {content ? <content.WalletMenuPanel id={id} anchor={anchor} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
