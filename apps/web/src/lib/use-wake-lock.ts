'use client';

import { useEffect, useState } from 'react';
import { usePageVisible } from './use-page-visible';

/** The part of WakeLockSentinel this hook uses. */
interface Sentinel {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

/** navigator.wakeLock, where the browser has it (secure contexts only). */
function wakeLockApi(): { request(type: 'screen'): Promise<Sentinel> } | undefined {
  return (navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock;
}

/**
 * Spec §18.4.3 (Task 3): keeps the screen on while `active`, so a phone does not lock halfway through the proof. The
 * browser drops the lock when the tab hides, and this hook asks again when the tab shows. A browser without the API,
 * or one that refuses (a battery saver, a permissions policy), changes nothing: the proof runs the same and the screen
 * may dim. Returns whether a lock is held now.
 */
export function useWakeLock(active: boolean): boolean {
  const visible = usePageVisible();
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const api = active && visible ? wakeLockApi() : undefined;
    if (!api) return;
    let live = true;
    let sentinel: Sentinel | null = null;
    const dropped = () => {
      if (live) setHeld(false);
    };
    let request: Promise<Sentinel>;
    try {
      request = api.request('screen');
    } catch {
      return;
    }
    request.then(
      (s) => {
        // The run ended, or the tab hid, before the browser answered.
        if (!live) {
          s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        s.addEventListener('release', dropped);
        setHeld(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
      setHeld(false);
      if (sentinel) {
        sentinel.removeEventListener('release', dropped);
        if (!sentinel.released) sentinel.release().catch(() => undefined);
      }
    };
  }, [active, visible]);
  return held;
}
