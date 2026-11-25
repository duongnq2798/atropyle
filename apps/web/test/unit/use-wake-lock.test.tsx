import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '../../src/lib/use-wake-lock';

interface FakeSentinel {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
  /** The browser drops the lock itself (the tab hides, a battery saver). */
  drop(): void;
}

/** navigator.wakeLock as Chromium has it; `defer` holds each request until the test settles it. */
function install(o: { refuse?: boolean; defer?: boolean } = {}) {
  const sentinels: FakeSentinel[] = [];
  const pending: (() => void)[] = [];
  const make = (): FakeSentinel & {
    addEventListener(t: string, fn: () => void): void;
    removeEventListener(t: string, fn: () => void): void;
  } => {
    const listeners = new Set<() => void>();
    const s = {
      released: false,
      release: vi.fn(async () => {
        s.released = true;
      }),
      addEventListener: (_t: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_t: string, fn: () => void) => listeners.delete(fn),
      drop: () => {
        s.released = true;
        for (const fn of listeners) fn();
      },
    };
    sentinels.push(s);
    return s;
  };
  const request = vi.fn((_type: string) => {
    if (o.refuse) return Promise.reject(new DOMException('denied', 'NotAllowedError'));
    if (o.defer) return new Promise((resolve) => pending.push(() => resolve(make())));
    return Promise.resolve(make());
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, sentinels, settle: () => pending.shift()?.() };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

function setVisibility(state: 'visible' | 'hidden', spy: ReturnType<typeof vi.spyOn>) {
  spy.mockReturnValue(state);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('keeps the screen on while active, and lets it go when the run ends', async () => {
    const { request, sentinels } = install();
    const h = renderHook(({ on }: { on: boolean }) => useWakeLock(on), { initialProps: { on: false } });
    expect(request).not.toHaveBeenCalled();
    h.rerender({ on: true });
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    expect(h.result.current).toBe(true);
    h.rerender({ on: false });
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(h.result.current).toBe(false);
  });

  it('lets go while the tab is hidden, and asks again when it is shown', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    const { request, sentinels } = install();
    const h = renderHook(() => useWakeLock(true));
    await flush();
    expect(h.result.current).toBe(true);
    setVisibility('hidden', visibility);
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(h.result.current).toBe(false);
    setVisibility('visible', visibility);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(h.result.current).toBe(true);
  });

  it('lets go at once of a lock that arrives after the run ended', async () => {
    const { sentinels, settle } = install({ defer: true });
    const h = renderHook(({ on }: { on: boolean }) => useWakeLock(on), { initialProps: { on: true } });
    h.rerender({ on: false });
    settle();
    await flush();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(h.result.current).toBe(false);
  });

  it('follows the browser when it drops the lock itself', async () => {
    const { sentinels } = install();
    const h = renderHook(() => useWakeLock(true));
    await flush();
    act(() => sentinels[0].drop());
    expect(h.result.current).toBe(false);
  });

  it('changes nothing without the API, or when the browser refuses', async () => {
    const bare = renderHook(() => useWakeLock(true));
    await flush();
    expect(bare.result.current).toBe(false);
    const { request } = install({ refuse: true });
    const h = renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(h.result.current).toBe(false);
  });
});
