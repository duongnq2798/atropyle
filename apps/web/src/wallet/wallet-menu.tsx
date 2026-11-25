'use client';

import { useT } from '@/i18n/provider';
import { addressGroups, compactAddress } from '@/lib/address';
import { lazyChunk } from '@/lib/lazy-chunk';
import { messages as walletText } from '@/messages/wallet.messages';
import { Avatar } from '@/ui/avatar';
import { Digits } from '@/ui/digits';
import { useLazyOverlay } from '@/ui/lazy-overlay';
import { Spinner } from '@/ui/spinner';
import { useWallet } from './provider';

/** The menu loads when the page is idle, or on the first hover, focus or press of the account button (ruling R23). */
export const walletMenuPanel = lazyChunk(() => import('./wallet-menu-panel'));

/**
 * The account button's box: its height, border and padding, the face alone below sm and from md to lg, where the bar
 * nav takes the header's room, and the face and the short address elsewhere. The placeholder of a reconnect
 * (wallet-button.tsx) is drawn in the same box, so the header keeps its width when the wallet comes back (spec §6,
 * e2e wallet.spec test 1).
 */
export const ACCOUNT_BOX =
  'inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface-1 pr-1.5 pl-1.5 sm:pr-3 md:pr-1.5 lg:pr-3';

/** Where the account button shows the short address beside the face. */
export const SHORT_SHOWN = 'hidden sm:inline md:hidden lg:inline';

/**
 * The short form of `compactAddress`, drawn as the full address in the menu below it (spec §18.4.2 Task 1): the
 * Ledger voice, a muted 0x and ellipsis, the checksum capitals at 650. The spaces stay in the text, so what the button
 * shows is part of its name (WCAG 2.5.3, axe's label-content-name-mismatch); the span's word spacing draws them as
 * the 0.45ch gaps of the full address.
 */
function ShortAddress({ address }: { address: string }) {
  const g = addressGroups(address);
  if (g.length === 1) return <>{address}</>;
  return (
    <>
      <span className="text-ink-muted">0x</span>
      <Digits group={g[1] ?? ''} /> <Digits group={g[2] ?? ''} /> <span className="text-ink-muted">…</span>{' '}
      <Digits group={g[9] ?? ''} /> <Digits group={g[10] ?? ''} />
    </>
  );
}

/**
 * The connected account: a short form on the button (the full address is one click away, Task 5 `compactAddress`),
 * the full address, the network and Disconnect in the menu. The button never wraps or shrinks; from md to lg, where
 * the bar nav takes the header's room, it shows the face only, as on phones (parked 7B-T1, e2e wallet.spec).
 */
export function WalletMenu() {
  const t = useT(walletText);
  const { wallet, wrongChain } = useWallet();
  const { open, setOpen, id, anchor, trigger, content } = useLazyOverlay(walletMenuPanel);
  if (!wallet) return null;
  const short = compactAddress(wallet.account);
  return (
    <>
      <button
        {...trigger}
        type="button"
        data-wallet-button=""
        aria-label={t(wrongChain ? 'accountButtonWrong' : 'accountButton', { account: short })}
        className={`relative ${ACCOUNT_BOX} text-small transition-colors duration-150 hover:bg-surface-2`}
      >
        {trigger['aria-busy'] ? (
          <span className="grid size-6 place-items-center text-ink-muted">
            <Spinner size={16} />
          </span>
        ) : (
          <Avatar address={wallet.account} size={24} />
        )}
        <span translate="no" data-part="short" className={`voice-ledger [word-spacing:-0.55ch] ${SHORT_SHOWN}`}>
          <ShortAddress address={wallet.account} />
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
