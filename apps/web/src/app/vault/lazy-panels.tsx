'use client';

import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { useT } from '@/i18n/provider';
import { type LazyChunk, lazyChunk } from '@/lib/lazy-chunk';
import { messages } from '@/messages/vault.messages';
import { ErrorBox } from '@/tx/error-box';
import { Skeleton, SkeletonText } from '@/ui/skeleton';
import type * as GuardianModule from './guardian-tab';
import type * as HeirModule from './heir-letter';
import type { PanelProps } from './vault-page';

/** The role panels, out of the first load of /vault/ (R23: the page stays under 240 kB). A visitor never loads them. */
export const guardianTabChunk: LazyChunk<typeof GuardianModule> = lazyChunk(() => import('./guardian-tab'));
export const heirLetterChunk: LazyChunk<typeof HeirModule> = lazyChunk(() => import('./heir-letter'));

/** For the pointerenter and focus of the Connect button (GuestView's warm()): the panel is there when the wallet is. */
export function preloadPanels(): void {
  guardianTabChunk.preload();
  heirLetterChunk.preload();
}

function PanelLoading({ name }: { name: string }) {
  const t = useT(messages);
  return (
    <div data-testid={`${name}-panel-loading`} aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">{t('panelLoading')}</span>
      <Skeleton className="h-8 w-2/3" />
      <SkeletonText lines={4} />
    </div>
  );
}

export interface LazyPanelProps<M> extends PanelProps {
  /** The test ids' prefix: `${name}-panel-loading`, `${name}-panel-error`. */
  name: string;
  chunk: LazyChunk<M>;
  pick(m: M): ComponentType<PanelProps>;
}

/**
 * A panel loaded when it renders, as LazyActionFlow loads ActionFlow: a skeleton until it comes, an ErrorBox with a
 * Retry if its chunk fails (offline, a new deploy).
 */
export function LazyPanel<M>({ name, chunk, pick, ...props }: LazyPanelProps<M>) {
  const q = useQuery({
    queryKey: ['atropyle', 'panel-view', name],
    queryFn: chunk.load,
    initialData: () => chunk.peek() ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
  if (q.data) {
    const C = pick(q.data);
    return <C {...props} />;
  }
  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} testId={`${name}-panel-error`} />;
  return <PanelLoading name={name} />;
}

const pickGuardian = (m: typeof GuardianModule) => m.GuardianTab;
const pickHeir = (m: typeof HeirModule) => m.HeirLetter;

export function GuardianPanel(props: PanelProps) {
  return <LazyPanel name="guardian" chunk={guardianTabChunk} pick={pickGuardian} {...props} />;
}

export function HeirPanel(props: PanelProps) {
  return <LazyPanel name="heir" chunk={heirLetterChunk} pick={pickHeir} {...props} />;
}
