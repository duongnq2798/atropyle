'use client';

import { useId } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/time-machine.messages';
import { ErrorBox } from '@/tx/error-box';
import { Skeleton, SkeletonText } from '@/ui/skeleton';

const PILL = 'block rounded-full border border-line';

export const TIME_MACHINE_BOX = 'flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6';
/**
 * The stage inside the box: edge to edge of the box on a phone (the box's p-5), so the thread gets every pixel; a
 * framed screen from sm up.
 */
export const TIME_MACHINE_STAGE =
  'relative isolate -mx-5 flex flex-col gap-4 overflow-hidden border-line border-y bg-bg/50 p-4 ' +
  'sm:mx-0 sm:rounded-2xl sm:border-x sm:p-5';

/**
 * The time machine's box while its code or its engine loads, with the shape of what comes (the chips, the stage
 * and its thread, the moments), so nothing jumps when it arrives; or the error of that load with a Retry.
 */
export function TimeMachineShell({
  testId,
  className,
  error,
  onRetry,
}: {
  testId: string;
  className?: string;
  error: unknown;
  onRetry(): void;
}) {
  const t = useT(messages);
  const titleId = useId();
  const failed = error !== null && error !== undefined;
  return (
    <section
      data-testid={testId}
      aria-busy={failed ? undefined : true}
      aria-labelledby={titleId}
      className={cn(TIME_MACHINE_BOX, className)}
    >
      <header className="flex flex-col gap-1.5">
        <h2 id={titleId} className="font-display text-ink text-title">
          {t('title')}
        </h2>
        <p className="text-ink-muted text-small">{failed ? t('failed') : t('loading')}</p>
      </header>
      {failed ? (
        <ErrorBox error={error} onRetry={onRetry} testId={`${testId}-error`} />
      ) : (
        <div aria-hidden="true" className="flex flex-col gap-5">
          {/* The chips and the badge are pills with an edge: their outlines, empty. */}
          <div className="flex flex-wrap gap-2">
            <span className={cn(PILL, 'h-11 w-20')} />
            <span className={cn(PILL, 'h-11 w-40')} />
            <span className={cn(PILL, 'h-11 w-28')} />
          </div>
          <div className={TIME_MACHINE_STAGE}>
            <span className={cn(PILL, 'h-8 w-28')} />
            {/* The thread's place, at the stage's own ratio: 3:1 on a phone, 5:1 from 32rem. */}
            <div className="@container">
              <div className="mx-5.5 flex aspect-[3/1] items-center @min-[32rem]:aspect-[5/1]">
                <span className="h-0.5 w-full rounded-full bg-line" />
              </div>
            </div>
            <Skeleton className="h-6 w-2/3" />
          </div>
          <SkeletonText lines={3} />
        </div>
      )}
    </section>
  );
}
