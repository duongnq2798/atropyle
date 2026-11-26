'use client';

import { useQuery } from '@tanstack/react-query';
import { type LazyChunk, lazyChunk } from '@/lib/lazy-chunk';
import { TimeMachineShell } from './shell';
import type * as View from './time-machine';
import type { TimeMachineProps } from './time-machine';

/** The time machine's own UI, out of the first load of the page that shows it. */
export const timeMachineViewChunk: LazyChunk<typeof View> = lazyChunk(() => import('./time-machine'));

/**
 * TimeMachine, loaded when it renders (the vault page, the wizard). A chunk that fails to load is an ErrorBox with a
 * Retry in the time machine's own box; next/dynamic would throw it to the error boundary and blank the page.
 */
export function LazyTimeMachine(props: TimeMachineProps) {
  const q = useQuery({
    queryKey: ['atropyle', 'time-machine-view'],
    queryFn: timeMachineViewChunk.load,
    initialData: () => timeMachineViewChunk.peek() ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
  if (q.data) {
    const { TimeMachine } = q.data;
    return <TimeMachine {...props} />;
  }
  return (
    <TimeMachineShell
      testId={props.testId ?? 'time-machine'}
      className={props.className}
      error={q.error}
      onRetry={() => void q.refetch()}
    />
  );
}
