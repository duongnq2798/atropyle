'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** `location.hash`, with its `#`; empty while prerendering. Pages parse it themselves. */
export function useLocationHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
}

/** Changes the fragment without a history entry (the /create/ mode switch) and notifies useLocationHash. */
export function replaceHash(hash: string): void {
  const next = hash.startsWith('#') ? hash : `#${hash}`;
  window.history.replaceState(window.history.state, '', next);
  window.dispatchEvent(new Event('hashchange'));
}
