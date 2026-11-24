import { EASE_OUT_EXPO, SPRING_EASING, SPRING_MS } from './tokens';

/** How a move runs: the spring (default), straight over `linear` ms, or at once (a drag). */
export type RevealMove = 'spring' | 'instant' | { linear: number };

/** An element, and the transform it moves to. */
export type Move = readonly [element: HTMLElement | null | undefined, transform: string];

/** Where each element was put last, and the animation that takes it there while it runs. */
const placed = new WeakMap<Element, string>();
const running = new WeakMap<Element, Animation>();

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The spring where the engine has no CSS `linear()` (Safari before 17.2, Chrome before 113, Firefox before 112, all
 * inside Next's default browser targets). There Element.animate throws on SPRING_EASING.
 */
const SPRING_FALLBACK = `cubic-bezier(${EASE_OUT_EXPO.join(', ')})`;
let springOk: boolean | undefined;

/** SPRING_EASING where the engine reads `linear()`, else the out-expo curve. Asked on the first move, never in SSR. */
function springEasing(): string {
  springOk ??=
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('transition-timing-function', 'linear(0, 1)');
  return springOk ? SPRING_EASING : SPRING_FALLBACK;
}

/** The timing of a move, or null when it jumps: `instant`, reduced motion, or a linear move of no finite length. */
export function moveTiming(move: RevealMove): { duration: number; easing: string } | null {
  if (move === 'instant' || reducedMotion()) return null;
  if (move === 'spring') return { duration: SPRING_MS, easing: springEasing() };
  const ms = Number.isFinite(move.linear) ? Math.max(0, move.linear) : 0;
  return ms > 0 ? { duration: ms, easing: 'linear' } : null;
}

function inMotion(el: Element): boolean {
  const a = running.get(el);
  return a !== undefined && (a.playState === 'running' || a.playState === 'paused');
}

/**
 * Moves every element to its transform on one clock, with the Web Animations API (a transform animation runs on
 * the compositor). Each element starts from where it stands now, also halfway through an earlier move, and all of
 * them run one curve from the same moment: the three boxes of a RevealWindow keep summing to zero through any
 * interruption, and the "now" point stays on the window's edge. CSS transitions cannot promise that. A box whose
 * value does not change carries on along its old transition while the others restart, and a reversal shortens
 * only its own (in Chromium the content drifted by up to 47 px on a 1000 px thread).
 */
export function moveTogether(moves: readonly Move[], move: RevealMove = 'spring'): void {
  const timing = moveTiming(move);
  // Every start is read before anything changes, so that all of them come from one moment.
  const starts = moves.map(([el]) => {
    if (!el || !timing) return null;
    if (inMotion(el)) return { from: getComputedStyle(el).transform, moving: true };
    return { from: placed.get(el) ?? el.style.transform, moving: false };
  });
  moves.forEach(([el, to], i) => {
    if (!el) return;
    running.get(el)?.cancel();
    running.delete(el);
    el.style.transform = to;
    placed.set(el, to);
    const start = starts[i];
    // At rest where it belongs, an element stays; in motion, it restarts on the new clock, even towards its value.
    if (!timing || !start?.from || (!start.moving && start.from === to)) return;
    if (typeof el.animate !== 'function') return;
    const frames = [{ transform: start.from }, { transform: to }];
    // The element already stands at `to`, so a move the engine refuses becomes a jump and the boxes still sum to
    // zero. Thrown here, it would stop the other boxes, or unmount the page from a layout effect.
    let a: Animation;
    try {
      a = el.animate(frames, timing);
    } catch {
      try {
        a = el.animate(frames, { ...timing, easing: SPRING_FALLBACK });
      } catch {
        return;
      }
    }
    // The next move cancels this one, which rejects `finished`: expected, not an error.
    a.finished.catch(() => {});
    running.set(el, a);
  });
}
