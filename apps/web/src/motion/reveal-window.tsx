'use client';

import { type ReactNode, type Ref, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/** How setRange moves the window: the spring (default), straight over `linear` ms, or at once (a drag). */
export type RevealMove = 'spring' | 'instant' | { linear: number };

export interface RevealWindowHandle {
  /** Moves the window to [from, to] (percent of the width) without a React render. Holds until the props move. */
  setRange(from: number, to: number, move?: RevealMove): void;
}

export interface RevealWindowProps {
  /** Left edge of what shows, percent of the width, 0–100. */
  from: number;
  /** Right edge of what shows, percent of the width, 0–100; below `from` it shows nothing. */
  to: number;
  children: ReactNode;
  ref?: Ref<RevealWindowHandle>;
  className?: string;
}

const pct = (n: number): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
const fix = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * The three translations that show [from, to] of the content in place: the outer box clips the left edge, the
 * middle box the right edge, the inner box puts the content back where it was. They sum to zero, so the content
 * never moves, also halfway through a transition (all three share one curve).
 */
export function revealTransforms(from: number, to: number): [string, string, string] {
  const a = pct(from);
  const b = Math.max(a, pct(to));
  return [`translateX(${fix(a)}%)`, `translateX(${fix(b - 100 - a)}%)`, `translateX(${fix(100 - b)}%)`];
}

/** The spring of globals.css over SPRING_MS (443 ms), only when motion is allowed; what moves with the window uses it. */
export const REVEAL_MOVE = 'motion-safe:transition-transform motion-safe:duration-[443ms] motion-safe:ease-spring';

function transitionOf(move: RevealMove): string {
  if (move === 'instant') return 'none';
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'none';
  }
  // An empty inline value hands the transition back to the REVEAL_MOVE classes.
  if (move === 'spring') return '';
  return `transform ${Math.max(0, move.linear)}ms linear`;
}

/**
 * The lit part of the Thread (R18.4): a window over its children that moves on the compositor only, by
 * `transform`. The path inside never changes, so a moving "now" or a drag never re-renders or re-lays out SVG.
 */
export function RevealWindow({ from, to, children, ref, className }: RevealWindowProps) {
  const outer = useRef<HTMLDivElement>(null);
  const middle = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [ta, tb, tc] = revealTransforms(from, to);

  // New props take the window back from setRange, with the spring again.
  useLayoutEffect(() => {
    const values = [ta, tb, tc];
    [outer, middle, inner].forEach((box, i) => {
      if (!box.current) return;
      box.current.style.transition = '';
      box.current.style.transform = values[i];
    });
  }, [ta, tb, tc]);

  useImperativeHandle(
    ref,
    () => ({
      setRange(f, t, move = 'spring') {
        const values = revealTransforms(f, t);
        const transition = transitionOf(move);
        [outer, middle, inner].forEach((box, i) => {
          if (!box.current) return;
          box.current.style.transition = transition;
          box.current.style.transform = values[i];
        });
      },
    }),
    [],
  );

  return (
    <div
      ref={outer}
      data-reveal="outer"
      className={cn('absolute inset-0 overflow-hidden', REVEAL_MOVE, className)}
      style={{ transform: ta }}
    >
      <div
        ref={middle}
        data-reveal="middle"
        className={cn('absolute inset-0 overflow-hidden', REVEAL_MOVE)}
        style={{ transform: tb }}
      >
        <div ref={inner} data-reveal="inner" className={cn('absolute inset-0', REVEAL_MOVE)} style={{ transform: tc }}>
          {children}
        </div>
      </div>
    </div>
  );
}
