'use client';

import { ChevronRight, RefreshCw, Wallet, WalletMinimal } from 'lucide-react';
import { m } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { errorCode } from '@/chain/query-client';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as walletText } from '@/messages/wallet.messages';
import { SPRING } from '@/motion/tokens';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { Dialog } from '@/ui/dialog';
import { InlineError } from '@/ui/inline-error';
import { Skeleton } from '@/ui/skeleton';
import { Spinner } from '@/ui/spinner';
import { UntrustedText } from '@/ui/untrusted-text';
import { useWallet } from './provider';
import type { WalletOption } from './types';

// The QR encoder loads only when the no-wallet help shows, so it stays out of every page's first bundle.
const QrCode = lazy(() => import('@/ui/qr-code').then((mod) => ({ default: mod.QrCode })));

/** Longer links (a sign link with its payload) make a QR code too dense for a phone camera; uqr throws past ~2.3 kB. */
export const QR_MAX_CHARS = 512;

export type PickerError = 'rejected' | 'requestPending' | 'connectFailed' | 'searchFailed';

/** The message for a failed connection: declined (4001, USER_REJECTED here), a prompt already open (-32002), or other. */
export function connectErrorKey(e: unknown): Exclude<PickerError, 'searchFailed'> {
  if (errorCode(e) === 'USER_REJECTED') return 'rejected';
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
  return code === -32002 ? 'requestPending' : 'connectFailed';
}

/** OKX Wallet, known by its EIP-6963 rdns or the OKX App's injected global. Never by name: any wallet can pick a name. */
export function isRecommended(w: Pick<WalletOption, 'rdns' | 'source'>): boolean {
  return w.rdns === 'com.okex.wallet' || w.source === 'okxwallet';
}

export interface WalletPickerProps {
  /** null until the first search ends. */
  wallets: readonly WalletOption[] | null;
  searching: boolean;
  /** The wallet whose prompt is open. */
  connectingId: string | null;
  error: PickerError | null;
  /** The page to open on a phone; empty until known. */
  pageUrl: string;
  onPick(option: WalletOption): void;
  onSearch(): void;
}

function WalletIcon({ option }: { option: WalletOption }) {
  if (option.icon) {
    // A data: image from the wallet (wallet.ts keeps only data:image/ up to 100 kB); next/image cannot serve it here.
    // biome-ignore lint/performance/noImgElement: a data: URL from the wallet, in a static export
    return <img src={option.icon} alt="" width={36} height={36} className="size-9 shrink-0 rounded-xl" />;
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted">
      <Wallet aria-hidden="true" size={18} strokeWidth={1.5} />
    </span>
  );
}

function NoWallet({
  pageUrl,
  searching,
  failed,
  onSearch,
}: Pick<WalletPickerProps, 'pageUrl' | 'searching' | 'onSearch'> & { failed: boolean }) {
  const t = useT(walletText);
  const fits = pageUrl.length > 0 && pageUrl.length <= QR_MAX_CHARS;
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-thread">
        <WalletMinimal aria-hidden="true" size={22} strokeWidth={1.5} />
      </span>
      <p className="font-display text-ink text-title">{t('noWalletTitle')}</p>
      <p className="max-w-prose text-ink-muted text-small">{t('noWalletBody')}</p>
      {pageUrl ? (
        <div className="mt-1 flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-4">
          {fits ? (
            <Suspense
              fallback={
                <span className="block overflow-hidden rounded-xl">
                  <Skeleton className="size-[168px]" />
                </span>
              }
            >
              <QrCode value={pageUrl} label={t('pageLink')} size={168} />
            </Suspense>
          ) : null}
          <p className="text-caption text-ink-muted">{fits ? t('noWalletPhone') : t('qrTooLong')}</p>
          <CopyButton text={pageUrl} label={t('copyLink')} showText />
        </div>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        loading={searching}
        onClick={onSearch}
        icon={<RefreshCw aria-hidden="true" strokeWidth={1.5} />}
      >
        {t('searchAgain')}
      </Button>
      <div aria-live="polite">{failed ? <InlineError>{t('searchFailed')}</InlineError> : null}</div>
    </div>
  );
}

/** The body of the sheet in each of its states; pure, so a test renders each one without a wallet. */
export function WalletPicker({
  wallets,
  searching,
  connectingId,
  error,
  pageUrl,
  onPick,
  onSearch,
}: WalletPickerProps) {
  const t = useT(walletText);
  if (wallets === null && error === 'searchFailed' && !searching) {
    return (
      <div className="flex flex-col items-start gap-3">
        {/* It takes the place of the searching status, so it announces itself: a live region added with its text
            is not read out. */}
        <div role="alert">
          <InlineError>{t('searchFailed')}</InlineError>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onSearch}
          icon={<RefreshCw aria-hidden="true" strokeWidth={1.5} />}
        >
          {t('searchAgain')}
        </Button>
      </div>
    );
  }
  if (wallets === null) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{t('searching')}</span>
        <span className="block overflow-hidden rounded-2xl">
          <Skeleton className="h-[62px]" />
        </span>
        <span className="block overflow-hidden rounded-2xl">
          <Skeleton className="h-[62px]" />
        </span>
      </div>
    );
  }
  if (wallets.length === 0) {
    return <NoWallet pageUrl={pageUrl} searching={searching} failed={error === 'searchFailed'} onSearch={onSearch} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {wallets.map((w, at) => {
          const busy = connectingId === w.id;
          return (
            <m.li
              key={w.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: at * 0.04 }}
            >
              {/* The row whose prompt is open stays focusable (aria-disabled), so a keyboard user keeps their place. */}
              <button
                type="button"
                onClick={() => {
                  if (connectingId === null) onPick(w);
                }}
                disabled={connectingId !== null && !busy}
                aria-disabled={busy || undefined}
                aria-busy={busy || undefined}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-2xl border bg-surface-1 p-3 text-left',
                  'transition-[border-color,background-color,opacity,transform] duration-150',
                  busy ? 'border-thread/60' : 'border-line',
                  connectingId === null
                    ? 'hover:border-line-strong hover:bg-surface-2 active:scale-[0.99]'
                    : !busy && 'cursor-not-allowed opacity-60',
                )}
              >
                <WalletIcon option={w} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <UntrustedText value={w.name} max={40} className="truncate font-medium text-ink" />
                  {isRecommended(w) ? <span className="text-caption text-thread">{t('recommended')}</span> : null}
                </span>
                {busy ? (
                  <Spinner label={t('connecting')} />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    size={18}
                    strokeWidth={1.5}
                    className="shrink-0 text-ink-muted transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                )}
              </button>
            </m.li>
          );
        })}
      </ul>
      <div aria-live="polite">{error ? <InlineError>{t(error)}</InlineError> : null}</div>
    </div>
  );
}

/** The one wallet sheet of the site, opened by `openSheet()` from anywhere (Quyết định 17: no OKX app link). */
export function ConnectSheet() {
  const t = useT(walletText);
  const w = useWallet();
  const { sheetOpen, discover } = w;
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<PickerError | null>(null);
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    if (!sheetOpen) return;
    setError(null);
    setPageUrl(window.location.href);
    discover().catch(() => setError('searchFailed'));
  }, [sheetOpen, discover]);

  const pick = async (option: WalletOption) => {
    setError(null);
    setConnectingId(option.id);
    try {
      await w.connect(option);
    } catch (e) {
      setError(connectErrorKey(e));
    } finally {
      setConnectingId(null);
    }
  };

  const search = () => {
    setError(null);
    discover().catch(() => setError('searchFailed'));
  };

  return (
    <Dialog
      open={sheetOpen}
      onOpenChange={w.setSheetOpen}
      title={t('chooseWallet')}
      description={t('chooseWalletHint')}
      size="sm"
      onCloseAutoFocus={(event) => {
        // Back to what opened the sheet; after a connection that button is gone, so to the wallet button instead.
        const opener = w.sheetOpener.current;
        const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-wallet-button]');
        if (back) {
          event.preventDefault();
          back.focus();
        }
      }}
    >
      <WalletPicker
        wallets={w.wallets}
        searching={w.discovering}
        connectingId={connectingId}
        error={error}
        pageUrl={pageUrl}
        onPick={pick}
        onSearch={search}
      />
    </Dialog>
  );
}
