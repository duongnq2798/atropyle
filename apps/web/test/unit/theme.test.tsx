import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KVProvider } from '../../src/lib/kv';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import { ThemeProvider, useTheme } from '../../src/theme/provider';
import { applyTheme, parseTheme, readThemeAttr } from '../../src/theme/theme';

const root = document.documentElement;

function wrap(kv: KV) {
  return ({ children }: { children: ReactNode }) => (
    <KVProvider kv={kv}>
      <ThemeProvider>{children}</ThemeProvider>
    </KVProvider>
  );
}

function stubScheme(light: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: light,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.spyOn(window, 'matchMedia').mockImplementation(() => mql as unknown as MediaQueryList);
  return {
    set(next: boolean) {
      mql.matches = next;
      for (const l of listeners) l();
    },
  };
}

beforeEach(() => root.removeAttribute('data-theme'));
afterEach(() => {
  vi.restoreAllMocks();
  root.removeAttribute('data-theme');
});

describe('theme', () => {
  it('parses only light and dark; anything else is system', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    for (const raw of ['system', '', null, undefined, 'Dark', ' light', '"><script>'])
      expect(parseTheme(raw)).toBe('system');
  });

  it('sets data-theme only for an explicit choice', () => {
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
    root.setAttribute('data-theme', 'purple');
    expect(readThemeAttr()).toBe('system');
  });

  it('a stored garbage theme falls back to system', async () => {
    stubScheme(false);
    const kv = memoryKV();
    kv.set(KEYS.theme, 'sepia"><img src=x>');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.choice).toBe('system'));
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(result.current.resolved).toBe('dark');
  });

  it('applies the stored theme, then remembers a new choice', async () => {
    stubScheme(false);
    const kv = memoryKV();
    kv.set(KEYS.theme, 'light');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.choice).toBe('light'));
    expect(root.getAttribute('data-theme')).toBe('light');
    act(() => result.current.setChoice('dark'));
    expect(result.current.choice).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(kv.get(KEYS.theme)).toBe('dark');
    act(() => result.current.setChoice('system'));
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(kv.get(KEYS.theme)).toBe('system');
  });

  it('resolves system to the colour scheme of the device, live', async () => {
    const scheme = stubScheme(true);
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(memoryKV()) });
    await waitFor(() => expect(result.current.resolved).toBe('light'));
    act(() => scheme.set(false));
    expect(result.current.resolved).toBe('dark');
  });
});
