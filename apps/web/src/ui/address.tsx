'use client';

import { Fragment } from 'react';
import { useT } from '@/i18n/provider';
import { addressGroups, caseRuns, isAddressText } from '@/lib/address';
import { cn } from '@/lib/cn';
import { explorerAddress, explorerName } from '@/lib/links';
import { messages as ui } from '@/messages/ui.messages';
import { Avatar } from './avatar';
import { CopyButton } from './copy-button';
import { ExternalLink } from './external-link';
import { VisuallyHidden } from './visually-hidden';

// The face moved to avatar.tsx, so the account button can show it without loading the rest of this file (R23).
export { Avatar };

/** A group of hex digits: the checksum capitals at weight 650, the rest at the 400 of the voice. */
function Digits({ group }: { group: string }) {
  return (
    <>
      {caseRuns(group).map((r) =>
        r.upper ? (
          <span key={r.at} data-case="upper" className="font-[650]">
            {r.text}
          </span>
        ) : (
          <Fragment key={r.at}>{r.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * An address in full, in the Ledger voice and in groups of four (spec §4.2, §18.4.2 Task 1), so two addresses can be
 * compared group by group. Never shortened: a shortened address is what address-poisoning attacks rely on.
 *
 * The checksum capitals are drawn at weight 650 and every other character at 400. JetBrains Mono gives every glyph
 * the same advance at every weight, so the weights move nothing (test/unit/fonts.test.ts reads it in the file, test 1
 * of e2e/wallet.spec.ts measures it in Chromium). The drawn groups are aria-hidden: a screen reader reads the
 * address once, whole, from the hidden copy beside them, the same string this component always read. No aria-label
 * on a span (axe's aria-prohibited-attr).
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
  const grouped = parts.length > 1;
  return (
    <span
      data-address={address}
      className={cn('inline-flex min-w-0 max-w-full items-center gap-2 align-middle', className)}
    >
      {avatar ? <Avatar address={address} size={size === 'sm' ? 18 : 22} /> : null}
      <span
        aria-hidden="true"
        translate="no"
        data-part="groups"
        className={cn(
          'voice-ledger min-w-0 wrap-anywhere font-normal',
          // A hanging indent: "0x" hangs at the start of the first line and the groups stand in columns, so a group
          // that wraps starts under the first group, not 0.45ch off it. 1.55ch = "0x" (2ch) less one gap (0.45ch).
          grouped && 'pl-[1.55ch] -indent-[1.55ch]',
          size === 'sm' ? 'text-small' : 'text-body',
        )}
      >
        {/* Lines break between groups (<wbr>), never inside one. wrap-anywhere splits only a text that is not an
            address, which comes as one group. */}
        {parts.map((p) => (
          <Fragment key={p.at}>
            {p.at > 1 ? <wbr /> : null}
            <span className={p.at === 0 && grouped ? 'text-ink-muted' : p.at > 1 ? 'ml-[0.45ch]' : undefined}>
              {grouped && p.at > 0 ? <Digits group={p.text} /> : p.text}
            </span>
          </Fragment>
        ))}
      </span>
      <VisuallyHidden>
        {/* select-none: a selection across the drawn groups does not copy the address a second time. */}
        <span translate="no" className="select-none">
          {address}
        </span>
      </VisuallyHidden>
      {copy ? <CopyButton text={address} label={t('copyAddress')} /> : null}
      {explorer && isAddressText(address) ? (
        <ExternalLink href={explorerAddress(explorer, address)} variant="icon">
          {t('viewOn', { name: explorerName(explorer) })}
        </ExternalLink>
      ) : null}
    </span>
  );
}
