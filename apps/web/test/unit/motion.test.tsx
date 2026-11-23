import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { KVProvider } from '../../src/lib/kv';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import { useHaptics } from '../../src/motion/haptics';
import { MotionProvider, usePrefersReducedMotion } from '../../src/motion/provider';
import { withViewTransition } from '../../src/motion/view-transition';

function stubReduced(reduce: boolean) {
  const mql = { matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) => ({ ...mql, matches: q.includes('reduce') ? reduce : false }) as unknown as MediaQueryList,
  );
}

type StartVT = (cb: () => void) => unknown;
function stubViewTransitions(): Mock<StartVT> {
  const start = vi.fn<StartVT>((cb) => {
    cb();
    return {};
  });
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
  return start;
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'startViewTransition');
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('MotionProvider', () => {
  it('renders its children', () => {
    render(
      <MotionProvider>
        <p>inside</p>
      </MotionProvider>,
    );
    expect(screen.getByText('inside')).toBeTruthy();
  });

  it('reports the reduced motion preference after mount', () => {
    stubReduced(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });
});

describe('withViewTransition', () => {
  it('runs the update directly when the browser has no View Transitions', () => {
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it('runs the update inside a view transition when motion is allowed', () => {
    stubReduced(false);
    const start = stubViewTransitions();
    const update = vi.fn();
    withViewTransition(update);
    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it('skips the transition under reduced motion', () => {
    stubReduced(true);
    const start = stubViewTransitions();
    const update = vi.fn();
    withViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('useHaptics', () => {
  function wrap(kv: KV) {
    return ({ children }: { children: ReactNode }) => <KVProvider kv={kv}>{children}</KVProvider>;
  }

  it('vibrates 12 ms when supported and enabled, and can be turned off', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const kv = memoryKV();
    const { result } = renderHook(() => useHaptics(), { wrapper: wrap(kv) });
    expect(result.current.supported).toBe(true);
    act(() => result.current.pulse());
    expect(vibrate).toHaveBeenCalledWith(12);
    act(() => result.current.setEnabled(false));
    expect(kv.get(KEYS.haptics)).toBe('0');
    act(() => result.current.pulse());
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it('does nothing on a device without vibration', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    const { result } = renderHook(() => useHaptics(), { wrapper: wrap(memoryKV()) });
    expect(result.current.supported).toBe(false);
    expect(() => result.current.pulse()).not.toThrow();
  });

  it('remembers that vibration was turned off', () => {
    const kv = memoryKV();
    kv.set(KEYS.haptics, '0');
    const { result } = renderHook(() => useHaptics(), { wrapper: wrap(kv) });
    expect(result.current.enabled).toBe(false);
  });
});
