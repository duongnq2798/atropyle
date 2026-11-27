import { type LazyChunk, lazyChunk } from '@/lib/lazy-chunk';
import type * as Impl from './impl';

export type FlowsImpl = typeof Impl;

/**
 * The flow logic and the SDK it needs, in one chunk loaded once; a failed load is forgotten, so a retry can work.
 * `flowsChunk.preload` is for the pointerenter and focus of a control that leads to a flow (7A rule 19), never for
 * the first paint of / (R18.18).
 */
export const flowsChunk: LazyChunk<FlowsImpl> = lazyChunk(() => import('./impl'));

export function loadFlowsImpl(): Promise<FlowsImpl> {
  return flowsChunk.load();
}

export function peekFlowsImpl(): FlowsImpl | null {
  return flowsChunk.peek();
}
