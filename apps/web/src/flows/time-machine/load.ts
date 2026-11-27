import { type LazyChunk, lazyChunk } from '@/lib/lazy-chunk';
import type * as Logic from '../impl/time-machine';
import type { Scrubber } from './scrubber';

/** The scenario logic (with the SDK it needs) and the Scrubber (with Radix Slider): what every page loads. */
export type TimeMachineImpl = typeof Logic & { Scrubber: typeof Scrubber };

/**
 * The one loading path of the time machine (R18.14), for the vault page, the wizard and the home page (7C T6): the
 * logic and the Scrubber in parallel, once; a failed load is forgotten, so a retry can work. Never through
 * flows/impl/index.ts. `timeMachineChunk.preload` is for the pointerenter and focus of a control that leads to it
 * and for 7C's intent loader, never for the first paint of / (R18.18).
 */
export const timeMachineChunk: LazyChunk<TimeMachineImpl> = lazyChunk(() =>
  Promise.all([import('../impl/time-machine'), import('./scrubber')]).then(([logic, view]) => ({
    ...logic,
    Scrubber: view.Scrubber,
  })),
);

export function loadTimeMachine(): Promise<TimeMachineImpl> {
  return timeMachineChunk.load();
}

export function peekTimeMachine(): TimeMachineImpl | null {
  return timeMachineChunk.peek();
}
