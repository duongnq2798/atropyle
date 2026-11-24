'use client';

import { LazyMotion, MotionConfig } from 'motion/react';
import { type ReactNode, useSyncExternalStore } from 'react';
import { SPRING } from './tokens';

const loadFeatures = () => import('./features').then((r) => r.default);

/**
 * `reducedMotion="user"`: motion drops transform and layout animations for users who ask for less motion, and
 * keeps opacity. `strict` throws on a `motion.*` component, so every animated element is an `m.*` whose features,
 * and the engine with them, load lazily. A static `animate` or `useAnimate` import would carry the engine into the
 * first load; HoldButton shakes with CSS instead (test/unit/motion-imports.test.ts). The m components come from
 * motion/react-m, never from motion/react, whose own module carries every feature (features.ts, ruling R23).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}

const REDUCE = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(REDUCE);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function read(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches;
}

/** False while prerendering and hydrating (no mismatch), then the live preference. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
