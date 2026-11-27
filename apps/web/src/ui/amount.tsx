'use client';

import { useId, useState } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import type { Untrusted } from '@/lib/untrusted';
import { messages as common } from '@/messages/common.messages';
import { messages as ui } from '@/messages/ui.messages';
import { UntrustedText } from './untrusted-text';

/**
 * Tabular figures and the unit (spec §6). A toggletip, not a tooltip: a tap, a click or Enter shows the exact
 * base-unit value next to the figure, in a status that is on the page from the first paint, so a phone and a screen
 * reader reach it too; Escape, the same button or leaving it hides it again.
 */
export function Amount({
  raw,
  decimals,
  symbol = null,
  maxFraction = 6,
  className,
}: {
  raw: bigint;
  decimals: number | null;
  symbol?: Untrusted | string | null;
  maxFraction?: number;
  className?: string;
}) {
  const c = useT(common);
  const t = useT(ui);
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <button
        type="button"
        data-raw={raw.toString()}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={cn(
          'inline-flex items-baseline gap-1 rounded-sm text-left tabular-nums decoration-dotted underline-offset-4 hover:underline',
          className,
        )}
      >
        <span className="font-mono">{formatAmount(raw, decimals, maxFraction)}</span>
        <span className="text-ink-muted">
          {decimals === null ? c('baseUnits') : symbol ? <UntrustedText value={symbol} max={16} /> : null}
        </span>
      </button>
      <span id={id} role="status" className={open ? 'voice-ledger text-caption text-ink-muted' : 'sr-only'}>
        {open ? t('rawAmount', { raw: raw.toString() }) : null}
      </span>
    </span>
  );
}
