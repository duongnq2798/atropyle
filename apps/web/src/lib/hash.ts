'use client';

import { useSyncExternalStore } from 'react';

/** The Navigation API, where the browser has one; TypeScript 5.9's DOM types do not declare it yet. */
function navigationApi(): EventTarget | undefined {
  return (window as Window & { navigation?: EventTarget }).navigation;
}

/**
 * A <Link> or router.push that changes only the fragment fires neither hashchange nor popstate: Next writes the URL
 * itself with pushState or replaceState, so a reader that does not re-render would keep the old fragment. The
 * Navigation API's `currententrychange` fires on every such write. Next makes the write inside useInsertionEffect,
 * where React forbids updates, so readers hear of it a microtask later. hashchange and popstate cover fragment links
 * and back and forward.
 */
function subscribe(onChange: () => void): () => void {
  let live = true;
  const later = () =>
    queueMicrotask(() => {
      if (live) onChange();
    });
  const nav = navigationApi();
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  nav?.addEventListener('currententrychange', later);
  return () => {
    live = false;
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
    nav?.removeEventListener('currententrychange', later);
  };
}

/** `location.hash`, with its `#`; empty while prerendering. Pages parse it themselves. */
export function useLocationHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
}

/**
 * Changes the fragment without a history entry (the /create/ mode switch) and notifies useLocationHash. The state is
 * null so that Next's patched replaceState takes the write as external, keeps its own history state and moves its
 * router to the new URL; a later router update would otherwise write the old fragment back.
 */
export function replaceHash(hash: string): void {
  const next = hash.startsWith('#') ? hash : `#${hash}`;
  window.history.replaceState(null, '', next);
  window.dispatchEvent(new Event('hashchange'));
}
