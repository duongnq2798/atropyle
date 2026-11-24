'use client';

import { Fragment } from 'react';
import { useT } from '@/i18n/provider';
import { addressGroups, isAddressText } from '@/lib/address';
import { cn } from '@/lib/cn';
import { explorerAddress, explorerName } from '@/lib/links';
import { messages as ui } from '@/messages/ui.messages';
import { Avatar } from './avatar';
import { CopyButton } from './copy-button';
import { ExternalLink } from './external-link';

// The face moved to avatar.tsx, so the account button can show it without loading the rest of this file (R23).
export { Avatar };

/**
 * An address in full, in groups of four (spec §4.2), so two addresses can be compared group by group. Never
 * shortened: a shortened address is what address-poisoning attacks rely on.
 */
export function Address({
  address,
  explorer = null,
  copy = true,
  avatar = true,
  size = 'md',
  className,
}: {
  address: string;
  explorer?: string | null;
  copy?: boolean;
  avatar?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useT(ui);
  const parts = addressGroups(address).map((text, at) => ({ text, at }));
  return (
    <span
      data-address={address}
      className={cn('inline-flex min-w-0 max-w-full items-center gap-2 align-middle', className)}
    >
      {avatar ? <Avatar address={address} size={size === 'sm' ? 18 : 22} /> : null}
      <span
        translate="no"
        className={cn('min-w-0 wrap-anywhere font-mono tabular-nums', size === 'sm' ? 'text-small' : 'text-body')}
      >
        {/* Lines break between groups (<wbr>), never inside one. wrap-anywhere splits only a text that is not an
            address, which comes as one group. */}
        {parts.map((p) => (
          <Fragment key={p.at}>
            {p.at > 1 ? <wbr /> : null}
            <span className={p.at === 0 && parts.length > 1 ? 'text-ink-muted' : p.at > 1 ? 'ml-[0.45ch]' : undefined}>
              {p.text}
            </span>
          </Fragment>
        ))}
      </span>
      {copy ? <CopyButton text={address} label={t('copyAddress')} /> : null}
      {explorer && isAddressText(address) ? (
        <ExternalLink href={explorerAddress(explorer, address)} variant="icon">
          {t('viewOn', { name: explorerName(explorer) })}
        </ExternalLink>
      ) : null}
    </span>
  );
}
