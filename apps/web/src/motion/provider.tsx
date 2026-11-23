'use client';

import { LazyMotion, MotionConfig } from 'motion/react';
import { type ReactNode, useSyncExternalStore } from 'react';
import { SPRING } from './tokens';

const loadFeatures = () => import('./features').then((r) => r.default);

/**
 * `reducedMotion="user"`: motion drops transform and layout animations for users who ask for less motion, and
 * keeps opacity. `strict` throws on a `motion.*` component, so every animated element is an `m.*` and the engine
 * stays lazy.
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
