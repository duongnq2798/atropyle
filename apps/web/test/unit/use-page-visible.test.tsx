import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePageVisible } from '../../src/lib/use-page-visible';

afterEach(() => {
  vi.restoreAllMocks();
});

function Shown() {
  return <span>{String(usePageVisible())}</span>;
}

describe('usePageVisible', () => {
  it('follows the tab: hidden, then shown again', () => {
    const state = vi.spyOn(document, 'visibilityState', 'get');
    const { result } = renderHook(() => usePageVisible());
    expect(result.current).toBe(true);
    state.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(false);
    state.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(true);
  });

  it('is visible while prerendering', () => {
    expect(renderToString(<Shown />)).toBe('<span>true</span>');
  });
});
