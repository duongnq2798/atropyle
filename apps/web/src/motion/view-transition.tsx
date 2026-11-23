'use client';

import { type ReactNode, ViewTransition } from 'react';
import { flushSync } from 'react-dom';

/** One element per page carries this name; globals.css gives its group the spring (spec §4.1 "shared element"). */
export const THREAD_VT_NAME = 'atropyle-thread';

/** Wrap the page's main Thread: it morphs from one route to the next instead of cutting. */
export function SharedThread({ children }: { children: ReactNode }) {
  return <ViewTransition name={THREAD_VT_NAME}>{children}</ViewTransition>;
}

type StartViewTransition = (update: () => void) => unknown;

/**
 * A whole-page crossfade around a synchronous DOM update (the theme switch). Without the API, or when the user
 * prefers reduced motion, the update simply runs.
 */
export function withViewTransition(update: () => void): void {
  const start = (document as { startViewTransition?: StartViewTransition }).startViewTransition;
  const reduce =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof start !== 'function' || reduce) {
    update();
    return;
  }
  start.call(document, () => flushSync(update));
}
