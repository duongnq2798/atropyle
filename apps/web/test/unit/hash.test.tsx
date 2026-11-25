import { act, render, renderHook, screen } from '@testing-library/react';
import { memo, useInsertionEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { replaceHash, useLocationHash } from '../../src/lib/hash';

type HistoryWrite = History['pushState'];

let undo: Array<() => void> = [];

afterEach(() => {
  for (const u of undo.reverse()) u();
  undo = [];
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

/** Wraps pushState and replaceState for one test; `around` gets the real write and the call's arguments. */
function wrapHistory(around: (write: HistoryWrite, data: unknown, url: string | URL | null | undefined) => void) {
  const { pushState, replaceState } = window.history;
  const wrap =
    (write: HistoryWrite): HistoryWrite =>
    (data, _unused, url) =>
      around((d, u, l) => write.call(window.history, d, u, l), data, url);
  window.history.pushState = wrap(pushState);
  window.history.replaceState = wrap(replaceState);
  undo.push(() => {
    window.history.pushState = pushState;
    window.history.replaceState = replaceState;
  });
}

/**
 * What Chromium, Firefox and WebKit do (checked on 24 Nov 2026 with Playwright 1.65.1): pushState and replaceState
 * fire `currententrychange` on window.navigation, and neither fires hashchange or popstate. happy-dom 21 has no
 * Navigation API, and it fires a HashChangeEvent a macrotask after any history write that changes the fragment,
 * which no browser does; the stub drops those, so a test sees only what a browser would send.
 */
function stubNavigationApi(): void {
  const navigation = new EventTarget();
  wrapHistory((write, data, url) => {
    write(data, '', url);
    navigation.dispatchEvent(new Event('currententrychange'));
  });
  Object.defineProperty(window, 'navigation', { configurable: true, value: navigation });
  const dropHappyDomHashChange = (e: Event) => {
    if (e instanceof HashChangeEvent) e.stopImmediatePropagation();
  };
  window.addEventListener('hashchange', dropHappyDomHashChange, true);
  undo.push(() => {
    window.removeEventListener('hashchange', dropHappyDomHashChange, true);
    Reflect.deleteProperty(window, 'navigation');
  });
}

type NextEntry = { __NA?: boolean; _N?: boolean; __PRIVATE_NEXTJS_INTERNALS_TREE?: unknown } | null;

/**
 * Next 16.4.6's history patch (app-router.js), which AppRouter installs in its own useEffect: a write whose state has
 * __NA or _N is Next's own and passes through; any other write gets the current entry's __NA and router tree copied
 * in, and the router restores to its URL. Returns the URLs the router restored to.
 */
function patchHistoryLikeNext(): string[] {
  const routerSaw: string[] = [];
  wrapHistory((write, data, url) => {
    const own = data as NextEntry;
    if (own?.__NA || own?._N) {
      write(data, '', url);
      return;
    }
    const current = window.history.state as NextEntry;
    const copied: Record<string, unknown> = { ...(data as object | null) };
    if (current?.__NA) copied.__NA = current.__NA;
    if (current?.__PRIVATE_NEXTJS_INTERNALS_TREE)
      copied.__PRIVATE_NEXTJS_INTERNALS_TREE = current.__PRIVATE_NEXTJS_INTERNALS_TREE;
    if (url) routerSaw.push(String(url));
    write(copied, '', url);
  });
  return routerSaw;
}

/** Lets every queued microtask run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const NEXT_ENTRY = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'tree' };

/** Next's HistoryUpdater writes the URL in useInsertionEffect, where React forbids scheduling updates. */
function HistoryUpdater({ url }: { url: string }) {
  useInsertionEffect(() => window.history.pushState({ __NA: true }, '', url), [url]);
  return null;
}

/** A reader that does not re-render when the router does, like a memoised part of a page. */
const HashReader = memo(function HashReader() {
  const hash = useLocationHash();
  return <output>{hash || 'no hash'}</output>;
});

function App({ url }: { url: string }) {
  return (
    <>
      <HistoryUpdater url={url} />
      <HashReader />
    </>
  );
}

describe('useLocationHash', () => {
  it('follows the fragment', () => {
    window.history.replaceState(null, '', '/vault/#0xabc');
    const { result } = renderHook(() => useLocationHash());
    expect(result.current).toBe('#0xabc');
    act(() => {
      window.history.replaceState(null, '', '/vault/#0xdef');
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(result.current).toBe('#0xdef');
  });

  it('follows back and forward', () => {
    window.history.replaceState(null, '', '/verify/#0xabc');
    const { result } = renderHook(() => useLocationHash());
    act(() => {
      window.history.replaceState(null, '', '/verify/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current).toBe('');
  });

  it("follows a push that fires no hashchange, as Next's hash-only navigation does", async () => {
    stubNavigationApi();
    window.history.replaceState(null, '', '/verify/#0xabc');
    const { result } = renderHook(() => useLocationHash());
    // A <Link href="/verify/"> on /verify/#0xabc: Next pushes the URL itself and the page does not re-render.
    await act(async () => window.history.pushState({ __NA: true }, '', '/verify/'));
    expect(result.current).toBe('');
    await act(async () => window.history.replaceState({ __NA: true }, '', '/verify/#0xdef'));
    expect(result.current).toBe('#0xdef');
  });

  it('picks up a URL that Next writes in an insertion effect, without updating inside it', async () => {
    stubNavigationApi();
    window.history.replaceState(null, '', '/create/#real');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<App url="/create/#real" />);
    expect(screen.getByRole('status')).toHaveTextContent('#real');
    await act(async () => rerender(<App url="/create/" />));
    expect(screen.getByRole('status')).toHaveTextContent('no hash');
    expect(errors).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', async () => {
    stubNavigationApi();
    window.history.replaceState(null, '', '/verify/#0xabc');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() => useLocationHash());
    const nav = (window as unknown as { navigation: EventTarget }).navigation;
    const remove = vi.spyOn(nav, 'removeEventListener');
    unmount();
    expect(remove).toHaveBeenCalledWith('currententrychange', expect.any(Function));
    await act(async () => window.history.pushState(null, '', '/verify/'));
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('replaceHash', () => {
  it('changes the fragment in place and tells every reader', () => {
    window.history.replaceState(null, '', '/create/#drill');
    const entries = window.history.length;
    const { result } = renderHook(() => useLocationHash());
    act(() => replaceHash('#real'));
    expect(window.location.hash).toBe('#real');
    expect(result.current).toBe('#real');
    expect(window.history.length).toBe(entries);
  });

  it("goes through Next's history patch, so the router's URL keeps the new fragment", async () => {
    window.history.replaceState(NEXT_ENTRY, '', '/create/#drill');
    // Next 16.4.6 (app-router.js) syncs its canonicalUrl only for writes whose state carries no __NA of its own;
    // a write with __NA is taken as Next's own and passed through.
    const routerSaw = patchHistoryLikeNext();
    replaceHash('real');
    expect(window.location.hash).toBe('#real');
    expect(window.history.state).toEqual(NEXT_ENTRY);
    await settle();
    expect(routerSaw).toEqual(['#real']);
  });

  // AppRouter patches history in its own useEffect, and React runs a parent's passive effects after its children's,
  // so a page's mount effect (7C's useHashToken clears #t=<token>) writes before the patch is in.
  it("keeps Next's history entry when a mount effect runs it before Next patches history", () => {
    window.history.replaceState(NEXT_ENTRY, '', '/alerts/confirm/#t=TOKEN');
    replaceHash('');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/alerts/confirm/');
    // Without __NA and the tree, Back to this entry gets a popstate whose state Next ignores.
    expect(window.history.state).toEqual(NEXT_ENTRY);
  });

  it('tells the router once its patch is in, so a later router update does not write the old fragment back', async () => {
    window.history.replaceState(NEXT_ENTRY, '', '/alerts/confirm/#t=TOKEN');
    replaceHash('');
    // AppRouter's effect, later in the same flush of passive effects.
    const routerSaw = patchHistoryLikeNext();
    expect(routerSaw).toEqual([]);
    await settle();
    expect(routerSaw).toEqual(['#']);
    expect(window.location.hash).toBe('');
    expect(window.history.state).toEqual(NEXT_ENTRY);
  });

  it('does not tell the router a fragment the URL has moved on from', async () => {
    window.history.replaceState(NEXT_ENTRY, '', '/create/#drill');
    replaceHash('#real');
    replaceHash('#drill');
    const routerSaw = patchHistoryLikeNext();
    await settle();
    expect(routerSaw).toEqual(['#drill']);
    expect(window.location.hash).toBe('#drill');
    expect(window.history.state).toEqual(NEXT_ENTRY);
  });
});
