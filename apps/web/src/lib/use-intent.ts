import { type RefObject, useEffect, useState } from 'react';

/** Keys that scroll the page when no field has focus: a real scroll key (R18.18). */
const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
/** R18.18: the idle callback waits 2 s at most. */
const IDLE_TIMEOUT_MS = 2_000;
const QUARTER = 0.25;

/** scheduler.yield where the browser has it (Chromium), else a macrotask. */
export function yieldToMain(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return typeof s?.yield === 'function' ? s.yield() : new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs `task` after an idle callback (2 s at most; a macrotask where there is none, as in Safari) and a yield, so it
 * never runs in the task of the input that asked for it. Returns the cancel.
 */
export function afterIdle(task: () => void): () => void {
  let live = true;
  const go = () => {
    void yieldToMain().then(() => {
      if (live) task();
    });
  };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(go, { timeout: IDLE_TIMEOUT_MS });
    return () => {
      live = false;
      window.cancelIdleCallback(id);
    };
  }
  const id = window.setTimeout(go, 0);
  return () => {
    live = false;
    window.clearTimeout(id);
  };
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  );
}

/**
 * True once the reader shows intent toward `scene`, and from then on (R18.18): a pointerdown, keydown or focusin
 * inside it, or a quarter of `watch` (the scene itself by default) in view. The observer is armed only by the first
 * wheel, touchmove or scroll key, never by the load, a restored scroll position or a scroll from a script, so a page
 * that is only loaded (Lighthouse) never loads what waits on this. `watch` is a box shorter than a phone's screen,
 * since a quarter of a tall scene may never be in view at once. Then an idle callback and a yield (afterIdle).
 */
export function useIntent(scene: RefObject<HTMLElement | null>, watch: RefObject<HTMLElement | null> = scene): boolean {
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    const el = scene.current;
    if (!el || wanted) return;
    const listening = new AbortController();
    const opts = { signal: listening.signal, passive: true } as const;
    let io: IntersectionObserver | null = null;
    let cancel: (() => void) | null = null;
    const fire = () => {
      if (listening.signal.aborted) return;
      listening.abort();
      io?.disconnect();
      cancel = afterIdle(() => setWanted(true));
    };
    const arm = () => {
      if (io !== null || listening.signal.aborted) return;
      if (typeof IntersectionObserver === 'undefined') {
        fire();
        return;
      }
      // The first callback reports the box as it is, so its ratio decides, not isIntersecting (any overlap).
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.intersectionRatio >= QUARTER)) fire();
        },
        { rootMargin: '0px', threshold: QUARTER },
      );
      io.observe(watch.current ?? el);
    };
    for (const type of ['pointerdown', 'keydown', 'focusin'] as const) el.addEventListener(type, fire, opts);
    window.addEventListener('wheel', arm, opts);
    window.addEventListener('touchmove', arm, opts);
    window.addEventListener(
      'keydown',
      (e) => {
        if (SCROLL_KEYS.has(e.key) && !typing(e.target)) arm();
      },
      opts,
    );
    return () => {
      listening.abort();
      io?.disconnect();
      cancel?.();
    };
  }, [scene, watch, wanted]);
  return wanted;
}
