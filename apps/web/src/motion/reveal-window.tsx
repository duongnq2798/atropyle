'use client';

import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/cn';
import { moveTogether, type RevealMove } from './move';

export type { RevealMove } from './move';

export interface RevealWindowHandle {
  /**
   * Moves the window to [from, to] (percent of the width) without a React render. It stays there until `from` or
   * `to` of the props change, or until reset(): a render with the same props (a chain-now tick) leaves it alone.
   */
  setRange(from: number, to: number, move?: RevealMove): void;
  /** Takes the window back to the range of the props (the spring unless `move` says otherwise). */
  reset(move?: RevealMove): void;
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
 * never moves; moveTogether keeps that true halfway through a move, also one cut short by the next.
 */
export function revealTransforms(from: number, to: number): [string, string, string] {
  const a = pct(from);
  const b = Math.max(a, pct(to));
  return [`translateX(${fix(a)}%)`, `translateX(${fix(b - 100 - a)}%)`, `translateX(${fix(100 - b)}%)`];
}

/** What useMoveWith gives: both go on the element that moves. */
export interface MoveWith<T extends HTMLElement> {
  ref: RefObject<T | null>;
  style: CSSProperties;
}

/**
 * For what moves with the window, such as the "now" point: React renders the first transform (also in the
 * prerender), and every later one moves the element with moveTogether, on the window's clock and curve. Spread
 * the result on the element, and give it no transform, transition or animation any other way.
 */
export function useMoveWith<T extends HTMLElement>(transform: string): MoveWith<T> {
  const ref = useRef<T>(null);
  const [style] = useState<CSSProperties>(() => ({ transform }));
  const moved = useRef(false);
  useLayoutEffect(() => {
    moveTogether([[ref.current, transform]], moved.current ? 'spring' : 'instant');
    moved.current = true;
  }, [transform]);
  return { ref, style };
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
  // React renders the first range only (the prerender's). From then on only moveTogether writes the boxes, so a
  // render never overwrites what setRange put there, and every move starts from where the boxes really stand.
  const [first] = useState(() => [ta, tb, tc] as const);
  const props = useRef<readonly string[]>([ta, tb, tc]);
  const moved = useRef(false);

  // New props take the window back from setRange, with the spring.
  useLayoutEffect(() => {
    props.current = [ta, tb, tc];
    const how = moved.current ? 'spring' : 'instant';
    moveTogether(
      [
        [outer.current, ta],
        [middle.current, tb],
        [inner.current, tc],
      ],
      how,
    );
    moved.current = true;
  }, [ta, tb, tc]);

  useImperativeHandle(ref, () => {
    const show = (values: readonly string[], move: RevealMove) =>
      moveTogether(
        [
          [outer.current, values[0]],
          [middle.current, values[1]],
          [inner.current, values[2]],
        ],
        move,
      );
    return {
      setRange(f, t, move = 'spring') {
        show(revealTransforms(f, t), move);
      },
      reset(move = 'spring') {
        show(props.current, move);
      },
    };
  }, []);

  return (
    <div
      ref={outer}
      data-reveal="outer"
      className={cn('absolute inset-0 overflow-hidden', className)}
      style={{ transform: first[0] }}
    >
      <div
        ref={middle}
        data-reveal="middle"
        className="absolute inset-0 overflow-hidden"
        style={{ transform: first[1] }}
      >
        <div ref={inner} data-reveal="inner" className="absolute inset-0" style={{ transform: first[2] }}>
          {children}
        </div>
      </div>
    </div>
  );
}
