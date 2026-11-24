import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { replaceHash, useLocationHash } from '../../src/lib/hash';

afterEach(() => window.history.replaceState(null, '', '/'));

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

  it('replaceHash changes the fragment in place and tells every reader', () => {
    window.history.replaceState(null, '', '/create/#drill');
    const entries = window.history.length;
    const { result } = renderHook(() => useLocationHash());
    act(() => replaceHash('#real'));
    expect(window.location.hash).toBe('#real');
    expect(result.current).toBe('#real');
    expect(window.history.length).toBe(entries);
  });
});
