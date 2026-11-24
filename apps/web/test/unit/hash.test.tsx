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

  it("goes through Next's history patch, so the router's URL keeps the new fragment", () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'tree' }, '', '/create/#drill');
    // Next 16.4.6 (app-router.js) syncs its canonicalUrl only for writes whose state carries no __NA of its own;
    // a write with __NA is taken as Next's own and passed through.
    const routerSaw: string[] = [];
    wrapHistory((write, data, url) => {
      const internal = (data as { __NA?: boolean } | null)?.__NA;
      if (!internal && url) routerSaw.push(String(url));
      write(data, '', url);
    });
    replaceHash('real');
    expect(window.location.hash).toBe('#real');
    expect(routerSaw).toEqual(['#real']);
  });
});
