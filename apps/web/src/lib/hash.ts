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

type NextEntry = { __NA?: unknown } | null;

/**
 * Writes the fragment with a null state, so that Next's patched replaceState takes the write as external: it copies
 * its own entry state (`__NA` and the router tree) in and moves its router to the new URL. Until AppRouter's own
 * useEffect installs that patch, history is unpatched and the write wipes the entry state, so Back to this entry
 * would find nothing Next can restore; the state then goes back. Returns false in that case.
 */
function writeThroughRouter(next: string): boolean {
  const prev = window.history.state as NextEntry;
  window.history.replaceState(null, '', next);
  if (!prev?.__NA || (window.history.state as NextEntry)?.__NA) return true;
  window.history.replaceState(prev, '', next);
  return false;
}

/**
 * Changes the fragment without a history entry (the /create/ mode switch, a cleared token) and notifies
 * useLocationHash. Next's router moves to the new URL too; a later router update would otherwise write the old
 * fragment back. A page's mount effect runs before AppRouter's, which patches history in the same flush, so a write
 * that missed the patch goes to the router a microtask later, unless the URL has moved on by then. Call it from an
 * event handler or a useEffect, not during render or in a layout effect.
 */
export function replaceHash(hash: string): void {
  const next = hash.startsWith('#') ? hash : `#${hash}`;
  if (!writeThroughRouter(next)) {
    const href = window.location.href;
    queueMicrotask(() => {
      if (window.location.href === href) writeThroughRouter(next);
    });
  }
  window.dispatchEvent(new Event('hashchange'));
}
