'use client';

import { LogOut } from 'lucide-react';
import { ENV, explorerUrlOf } from '@/config/env';
import { useT } from '@/i18n/provider';
import { compactAddress } from '@/lib/address';
import { cn } from '@/lib/cn';
import { messages as walletText } from '@/messages/wallet.messages';
import { Address, Avatar } from '@/ui/address';
import { Button } from '@/ui/button';
import { Popover, PopoverClose } from '@/ui/popover';
import { UntrustedText } from '@/ui/untrusted-text';
import { networkName } from './network';
import { SwitchNetworkButton } from './network-banner';
import { useWallet } from './provider';

const EXPLORER = explorerUrlOf(ENV);

/**
 * The connected account: a short form on the button (the full address is one click away, Task 5 `compactAddress`),
 * the full address, the network and Disconnect in the menu.
 */
export function WalletMenu() {
  const t = useT(walletText);
  const { wallet, wrongChain, disconnect } = useWallet();
  if (!wallet) return null;
  const short = compactAddress(wallet.account);
  return (
    <Popover
      label={t('walletMenu')}
      className="w-80 max-w-[calc(100vw-1.5rem)]"
      trigger={
        <button
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
      }
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
    </Popover>
  );
}
