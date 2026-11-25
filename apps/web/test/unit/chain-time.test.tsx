import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChainNow } from '../../src/chain/time';

afterEach(() => {
  vi.useRealTimers();
});

describe('useChainNow', () => {
  it('ticks from the last read and is null without one', () => {
    vi.useFakeTimers();
    const read = { blockTimestamp: 1_000n, fetchedAtMs: Date.now() };
    const { result, rerender } = renderHook(({ r }) => useChainNow(r), {
      initialProps: { r: read as typeof read | null },
    });
    expect(result.current).toBe(1_000n);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(1_005n);
    rerender({ r: null });
    expect(result.current).toBeNull();
  });
});
