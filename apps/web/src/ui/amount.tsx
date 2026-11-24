'use client';

import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import type { Untrusted } from '@/lib/untrusted';
import { messages as common } from '@/messages/common.messages';
import { messages as ui } from '@/messages/ui.messages';
import { Tooltip } from './tooltip';
import { UntrustedText } from './untrusted-text';

/** Tabular figures, the unit, and the exact base-unit value on hover or focus (spec §6). */
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
  return (
    <Tooltip content={<span className="font-mono">{t('rawAmount', { raw: raw.toString() })}</span>}>
      <button
        type="button"
        data-raw={raw.toString()}
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
    </Tooltip>
  );
}
