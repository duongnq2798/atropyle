'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type LazyChunk, lazyChunk } from '@/lib/lazy-chunk';
import { ErrorBox } from '@/tx/error-box';
import { Button } from '@/ui/button';
import { SkeletonText } from '@/ui/skeleton';
import type * as Flow from './action-flow';
import type { ActionFlowProps } from './action-flow';

/**
 * ActionFlow and the TxCard under it, out of the first load of /vault/ (ruling R23: the page stays under 240 kB). A
 * visitor who never connects a wallet never loads the signing UI.
 */
export const actionFlowChunk: LazyChunk<typeof Flow> = lazyChunk(() => import('./action-flow'));

/**
 * ActionFlow, loaded when it renders. Until then its button stands where it will be, busy; a press on it is kept
 * and the flow prepares as soon as it arrives (`pressed`), so no press is lost. A chunk that fails to load is an
 * ErrorBox with a Retry in place of the button.
 */
export function LazyActionFlow(props: ActionFlowProps) {
  const [pressed, setPressed] = useState(false);
  const q = useQuery({
    queryKey: ['atropyle', 'action-flow-view'],
    queryFn: actionFlowChunk.load,
    initialData: () => actionFlowChunk.peek() ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
  if (q.data) {
    const { ActionFlow } = q.data;
    return <ActionFlow {...props} pressed={pressed} />;
  }
  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} testId={`${props.testId}-error`} />;
  // An auto action has no button to press (the check-in ritual): it waits as ActionFlow's own preparing state does,
  // in the page's own shape of what comes when it gives one (`preparing`: the ritual's card and hold).
  if (props.auto) {
    return (
      <div data-testid={`${props.testId}-preparing`} aria-busy="true" className="flex flex-col gap-2">
        {props.preparing ?? <SkeletonText lines={2} />}
      </div>
    );
  }
  return (
    <Button
      variant={props.variant ?? 'primary'}
      size="lg"
      className="self-start"
      data-testid={props.testId}
      loading={pressed}
      disabled={props.disabled}
      onClick={() => setPressed(true)}
    >
      {props.label}
    </Button>
  );
}
