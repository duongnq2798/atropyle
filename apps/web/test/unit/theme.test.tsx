import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KVProvider } from '../../src/lib/kv';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import { ThemeProvider, useTheme } from '../../src/theme/provider';
import { applyTheme, DEFAULT_THEME, parseTheme, readThemeAttr, THEME_CHOICES } from '../../src/theme/theme';

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

function Shown() {
  const { choice, resolved } = useTheme();
  return <span>{`${choice}/${resolved}`}</span>;
}

beforeEach(() => root.removeAttribute('data-theme'));
afterEach(() => {
  vi.restoreAllMocks();
  root.removeAttribute('data-theme');
});

describe('theme', () => {
  it('parses night, vellum and match device; anything else is night', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(THEME_CHOICES).toEqual(['dark', 'light', 'system']);
    for (const c of THEME_CHOICES) expect(parseTheme(c)).toBe(c);
    for (const raw of ['', null, undefined, 'Dark', ' light', 'auto', '"><script>'])
      expect(parseTheme(raw)).toBe('dark');
  });

  it('night removes data-theme; vellum and match device set it', () => {
    root.setAttribute('data-theme', 'light');
    applyTheme('dark');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(readThemeAttr()).toBe('dark');
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(root.getAttribute('data-theme')).toBe('system');
    expect(readThemeAttr()).toBe('system');
    root.setAttribute('data-theme', 'purple');
    expect(readThemeAttr()).toBe('dark');
  });

  it('vellum can be scoped to one element without touching the page', () => {
    const letter = document.createElement('article');
    applyTheme('light', letter);
    expect(letter.getAttribute('data-theme')).toBe('light');
    expect(root.hasAttribute('data-theme')).toBe(false);
    applyTheme('dark', letter);
    expect(letter.hasAttribute('data-theme')).toBe(false);
  });

  it('a stored garbage theme falls back to night', async () => {
    stubScheme(true);
    root.setAttribute('data-theme', 'light');
    const kv = memoryKV();
    kv.set(KEYS.theme, 'sepia"><img src=x>');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.choice).toBe('dark'));
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(result.current.resolved).toBe('dark');
  });

  it('a device that prefers light still opens at night', async () => {
    stubScheme(true);
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(memoryKV()) });
    await waitFor(() => expect(result.current.choice).toBe('dark'));
    expect(result.current.resolved).toBe('dark');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('prerenders at night', () => {
    const html = renderToString(
      <KVProvider kv={memoryKV()}>
        <ThemeProvider>
          <Shown />
        </ThemeProvider>
      </KVProvider>,
    );
    expect(html).toContain('dark/dark');
  });

  it('applies the stored theme, then remembers a new choice', async () => {
    stubScheme(false);
    const kv = memoryKV();
    kv.set(KEYS.theme, 'light');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.choice).toBe('light'));
    expect(root.getAttribute('data-theme')).toBe('light');
    act(() => result.current.setChoice('system'));
    expect(result.current.choice).toBe('system');
    expect(root.getAttribute('data-theme')).toBe('system');
    expect(kv.get(KEYS.theme)).toBe('system');
    act(() => result.current.setChoice('dark'));
    expect(result.current.choice).toBe('dark');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(kv.get(KEYS.theme)).toBe('dark');
  });

  it('match device follows the colour scheme of the device, live', async () => {
    const scheme = stubScheme(true);
    const kv = memoryKV();
    kv.set(KEYS.theme, 'system');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.resolved).toBe('light'));
    expect(result.current.choice).toBe('system');
    act(() => scheme.set(false));
    expect(result.current.resolved).toBe('dark');
  });
});
