import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';

/**
 * A module that loads with import() the first time it is wanted, and only once (ruling R23: the overlays of the
 * shell, the wallet sheet and the menus, stay out of every page's first-load JS).
 */
export interface LazyChunk<T> {
  /** The module once it has loaded, else null. */
  peek(): T | null;
  /** Loads it, once; after a failure (offline, a new deploy) the next call tries again. */
  load(): Promise<T>;
  /**
   * load() without the error, for pointerenter and focus of the control that opens it and for the page's idle time
   * (whenIdle), so the first open has no visible wait.
   */
  preload(): void;
}

// A load the reader asked for failed (a press on Connect, Menu, Settings or the account button): LoadNotice says
// so until a chunk next loads.
let failed = false;
const listeners = new Set<() => void>();
function setFailed(next: boolean): void {
  if (failed === next) return;
  failed = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For the onError of useChunk where a press asked for the chunk: LoadNotice shows the failure. */
export function reportLoadFailure(): void {
  setFailed(true);
}

/** True from a reported failure until a chunk next loads; false in the prerender and at hydration. */
export function useLoadFailed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => failed,
    () => false,
  );
}

export function lazyChunk<T>(importer: () => Promise<T>): LazyChunk<T> {
  let value: T | null = null;
  let pending: Promise<T> | null = null;
  const load = (): Promise<T> => {
    pending ??= importer().then(
      (v) => {
        value = v;
        setFailed(false);
        return v;
      },
      (e: unknown) => {
        pending = null;
        throw e;
      },
    );
    return pending;
  };
  return {
    peek: () => value,
    load,
    preload: () => {
      // A failed preload is not an error yet: the open that follows loads again and handles it.
      load().catch(() => {});
    },
  };
}

/**
 * The module while `wanted`, loading it when needed, and from then on (so a sheet that closes keeps its close
 * animation and its focus return). Null until it has loaded; `onError` runs when that load fails.
 */
export function useChunk<T>(chunk: LazyChunk<T>, wanted: boolean, onError?: () => void): T | null {
  const [loaded, setLoaded] = useState<T | null>(() => chunk.peek());
  const ready = chunk.peek();
  // Loaded by a preload since the last render: keep it from this render on, with no effect round trip.
  if (wanted && loaded === null && ready !== null) setLoaded(() => ready);
  const failed = useEffectEvent(() => onError?.());
  useEffect(() => {
    if (!wanted || loaded !== null) return;
    let live = true;
    chunk.load().then(
      (v) => {
        if (live) setLoaded(() => v);
      },
      () => {
        if (live) failed();
      },
    );
    return () => {
      live = false;
    };
  }, [chunk, wanted, loaded]);
  return loaded ?? (wanted ? ready : null);
}

/**
 * Runs `task` once the page is idle, after hydration, and returns the cancel. Safari has no requestIdleCallback,
 * so a timeout there. The shell warms its overlays with it: a phone has no hover, so without it the first tap on
 * Connect or Menu would wait for the chunk.
 */
export function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout: 4_000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 1_500);
  return () => window.clearTimeout(id);
}
