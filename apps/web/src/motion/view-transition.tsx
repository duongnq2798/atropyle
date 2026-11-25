'use client';

import { flushSync } from 'react-dom';

/**
 * The view-transition name of the page's main Thread (`<Thread shared>` puts it on its root), so the thread morphs
 * from one route to the next instead of cutting; globals.css gives its group the spring (spec §4.1 "shared
 * element"). At most one element per page: a name used twice aborts the whole transition.
 */
export const THREAD_VT_NAME = 'atropyle-thread';

type StartViewTransition = (update: () => void) => unknown;

/**
 * A whole-page crossfade around a synchronous DOM update (the theme switch). Without the API the update simply runs.
 * Under reduced motion it runs too: globals.css makes every view transition a 120 ms crossfade where nothing moves
 * (spec §4.4).
 */
export function withViewTransition(update: () => void): void {
  const start = (document as { startViewTransition?: StartViewTransition }).startViewTransition;
  if (typeof start !== 'function') {
    update();
    return;
  }
  start.call(document, () => flushSync(update));
}

type StartPendingViewTransition = (update: () => Promise<void>) => unknown;

/**
 * A crossfade around an update that commits later, such as a client route change: the browser keeps the old picture
 * until `committed` resolves or `maxMs` has passed, then animates to the new one. Without the API the update simply
 * runs; under reduced motion the crossfade is the 120 ms one of globals.css, as in withViewTransition.
 */
export function withPendingViewTransition(update: () => void, committed: Promise<void>, maxMs = 1_000): void {
  const start = (document as { startViewTransition?: StartPendingViewTransition }).startViewTransition;
  if (typeof start !== 'function') {
    update();
    return;
  }
  start.call(document, () => {
    update();
    return Promise.race([committed, new Promise<void>((resolve) => setTimeout(resolve, maxMs))]);
  });
}
