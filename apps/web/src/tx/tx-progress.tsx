'use client';

import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/tx.messages';
import type { StepPhase, StepRow } from './tx-view';

const SEGMENT: Record<StepPhase, string> = {
  ready: 'bg-line',
  skipped: 'bg-line',
  blocked: 'bg-danger/45',
  signing: 'bg-thread/30',
  pending: 'bg-thread/30',
  confirmed: 'bg-thread',
  failed: 'bg-danger',
};

/**
 * One segment per step, filled as the chain confirms them. The step in the wallet shimmers while motion is allowed;
 * under reduced motion it is a still, lighter segment. A native <progress> carries the value for assistive tech.
 */
export function TxProgress({
  rows,
  testId,
  className,
}: {
  rows: readonly StepRow[];
  testId?: string;
  className?: string;
}) {
  const t = useT(messages);
  const total = rows.length;
  const done = rows.filter((r) => r.phase === 'confirmed').length;
  const text = t('progress', { done, total });
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <progress
        data-testid={testId}
        value={done}
        max={total}
        aria-label={t('progressLabel')}
        aria-valuetext={text}
        className="sr-only"
      />
      <ol aria-hidden="true" className="flex items-center gap-1">
        {rows.map((r) => (
          <li
            key={r.index}
            data-phase={r.phase}
            className={cn(
              'relative h-1.5 flex-1 overflow-hidden rounded-full transition-colors duration-500',
              SEGMENT[r.phase],
            )}
          >
            {r.phase === 'signing' || r.phase === 'pending' ? (
              <span className="absolute inset-0 bg-linear-to-r from-thread/0 via-thread to-thread/0 motion-safe:animate-shimmer motion-reduce:hidden" />
            ) : null}
          </li>
        ))}
      </ol>
      <p aria-hidden="true" className="text-caption text-ink-muted tabular-nums">
        {text}
      </p>
    </div>
  );
}
