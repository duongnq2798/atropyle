import { useEffect, useEffectEvent, useState } from 'react';

/**
 * A module that loads with import() the first time it is wanted, and only once (ruling R23: the overlays of the
 * shell, the wallet sheet and the menus, stay out of every page's first-load JS).
 */
export interface LazyChunk<T> {
  /** The module once it has loaded, else null. */
  peek(): T | null;
  /** Loads it, once; after a failure (offline, a new deploy) the next call tries again. */
  load(): Promise<T>;
  /** load() for pointerenter and focus of the control that opens it, so the first open has no visible wait. */
  preload(): void;
}

export function lazyChunk<T>(importer: () => Promise<T>): LazyChunk<T> {
  let value: T | null = null;
  let pending: Promise<T> | null = null;
  const load = (): Promise<T> => {
    pending ??= importer().then(
      (v) => {
        value = v;
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
