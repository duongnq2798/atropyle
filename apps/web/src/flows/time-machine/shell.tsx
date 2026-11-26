'use client';

import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/time-machine.messages';
import { ErrorBox } from '@/tx/error-box';
import { SkeletonText } from '@/ui/skeleton';

export const TIME_MACHINE_BOX = 'flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6';

/** The time machine's box while its code or its engine loads, or with the error of that load and a Retry. */
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
  return (
    <section data-testid={testId} aria-busy={error ? undefined : true} className={cn(TIME_MACHINE_BOX, className)}>
      {error ? (
        <ErrorBox error={error} onRetry={onRetry} testId={`${testId}-error`} />
      ) : (
        <>
          <p className="text-ink-muted text-small">{t('loading')}</p>
          <SkeletonText lines={6} />
        </>
      )}
    </section>
  );
}
