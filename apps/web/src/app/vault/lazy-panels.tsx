'use client';

import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { useT } from '@/i18n/provider';
import { type LazyChunk, lazyChunk } from '@/lib/lazy-chunk';
import { messages } from '@/messages/vault.messages';
import { ErrorBox } from '@/tx/error-box';
import { Skeleton, SkeletonText } from '@/ui/skeleton';
import type * as PanelsModule from './panels';
import type { PanelProps } from './vault-page';

/**
 * The role panels, out of the first load of /vault/ (R23: the page stays under 240 kB). A visitor never loads them.
 * One chunk for the three (panels.ts): Connect preloads them all, and apart each carried its own copy of what they
 * share, which put the site's JS over its 900 kB budget.
 */
export const panelsChunk: LazyChunk<typeof PanelsModule> = lazyChunk(() => import('./panels'));

/** For the pointerenter and focus of the Connect button (GuestView's warm()): the panel is there when the wallet is. */
export function preloadPanels(): void {
  panelsChunk.preload();
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

const pickOwner = (m: typeof PanelsModule) => m.OwnerTab;
const pickGuardian = (m: typeof PanelsModule) => m.GuardianTab;
const pickHeir = (m: typeof PanelsModule) => m.HeirLetter;

export function OwnerPanel(props: PanelProps) {
  return <LazyPanel name="owner" chunk={panelsChunk} pick={pickOwner} {...props} />;
}

export function GuardianPanel(props: PanelProps) {
  return <LazyPanel name="guardian" chunk={panelsChunk} pick={pickGuardian} {...props} />;
}

export function HeirPanel(props: PanelProps) {
  return <LazyPanel name="heir" chunk={panelsChunk} pick={pickHeir} {...props} />;
}
