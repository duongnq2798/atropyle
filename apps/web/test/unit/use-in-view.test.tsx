import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInView } from '../../src/lib/use-in-view';
import { FakeObserver, stubIntersection } from '../helpers/intersection';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useInView', () => {
  it('follows the observer: off screen until the browser says otherwise, then back', () => {
    const show = stubIntersection();
    const el = document.createElement('ol');
    const { result } = renderHook(() => useInView({ current: el }, '0px 0px -25% 0px'));
    expect(result.current).toBe(false);
    expect(FakeObserver.all).toHaveLength(1);
    expect(FakeObserver.all[0].options.rootMargin).toBe('0px 0px -25% 0px');
    show(el, true);
    expect(result.current).toBe(true);
    show(el, false);
    expect(result.current).toBe(false);
  });

  it('stops observing when the component goes', () => {
    stubIntersection();
    const el = document.createElement('ol');
    const { unmount } = renderHook(() => useInView({ current: el }));
    expect(FakeObserver.all[0].targets.has(el)).toBe(true);
    unmount();
    expect(FakeObserver.all[0].targets.size).toBe(0);
  });

  it('counts as on screen in a browser without IntersectionObserver, so nothing waits for ever', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useInView({ current: document.createElement('ol') }));
    expect(result.current).toBe(true);
  });
});
