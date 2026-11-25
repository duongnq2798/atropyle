'use client';

import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { chainNow, formatRemaining, formatTimestamp } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { messages as ui } from '@/messages/ui.messages';

const MAX_DATE_MS = 8.64e15;

function dateOf(ts: bigint): { iso: string; text: string } | null {
  const ms = Number(ts) * 1000;
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return null;
  return { iso: new Date(ms).toISOString(), text: formatTimestamp(ts) };
}

/** Time to (or since) a chain timestamp, in chain time: the block's time plus the wall clock since the read. */
export function Countdown({
  target,
  blockTimestamp,
  fetchedAtMs,
  className,
}: {
  target: bigint;
  blockTimestamp: bigint;
  fetchedAtMs: number;
  className?: string;
}) {
  const t = useT(ui);
  const nowMs = useNow(1000) ?? fetchedAtMs;
  const r = formatRemaining(target, chainNow(blockTimestamp, fetchedAtMs, nowMs));
  const date = dateOf(target);
  return (
    <time
      dateTime={date?.iso}
      title={date?.text}
      data-past={r.past}
      className={cn('font-mono tabular-nums', r.past ? 'text-ink-muted' : 'text-ink', className)}
    >
      {r.past ? t('timeAgo', { time: r.text }) : t('inTime', { time: r.text })}
    </time>
  );
}
