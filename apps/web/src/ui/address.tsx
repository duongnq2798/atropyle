'use client';

import { Fragment, useMemo } from 'react';
import { useT } from '@/i18n/provider';
import { addressGroups, isAddressText } from '@/lib/address';
import { cn } from '@/lib/cn';
import { explorerAddress, explorerName } from '@/lib/links';
import { messages as ui } from '@/messages/ui.messages';
import { CopyButton } from './copy-button';
import { ExternalLink } from './external-link';
import { identiconOf } from './identicon';

/** Lightness comes from --avatar-l (0.78 dark, 0.52 light), so the face reads in both themes. */
export function Avatar({ address, size = 22 }: { address: string; size?: number }) {
  const { hue, cells } = useMemo(() => identiconOf(address), [address]);
  let d = '';
  for (let i = 0; i < 25; i++) if (cells[i]) d += `M${i % 5} ${Math.floor(i / 5)}h1v1h-1z`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-0.5 -0.5 6 6"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-full"
    >
      <rect x={-0.5} y={-0.5} width={6} height={6} style={{ fill: `oklch(var(--avatar-l) 0.05 ${hue} / 0.35)` }} />
      <path d={d} style={{ fill: `oklch(var(--avatar-l) 0.13 ${hue})` }} />
    </svg>
  );
}

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
