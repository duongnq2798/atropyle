import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KVProvider } from '../../src/lib/kv';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import { ThemeProvider, useTheme } from '../../src/theme/provider';
import {
  applyTheme,
  DEFAULT_THEME,
  parseTheme,
  readThemeAttr,
  THEME_CHOICES,
  THEME_SWAP_ATTR,
} from '../../src/theme/theme';

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
  it('parses vellum, night and match device; anything else is vellum', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(THEME_CHOICES).toEqual(['light', 'dark', 'system']);
    for (const c of THEME_CHOICES) expect(parseTheme(c)).toBe(c);
    for (const raw of ['', null, undefined, 'Dark', ' light', 'auto', '"><script>'])
      expect(parseTheme(raw)).toBe('light');
  });

  it('every choice sets data-theme; no attribute reads as vellum', () => {
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(readThemeAttr()).toBe('dark');
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(root.getAttribute('data-theme')).toBe('system');
    expect(readThemeAttr()).toBe('system');
    root.setAttribute('data-theme', 'purple');
    expect(readThemeAttr()).toBe('light');
    root.removeAttribute('data-theme');
    expect(readThemeAttr()).toBe('light');
  });

  it('a theme can be scoped to one element without touching the page', () => {
    const letter = document.createElement('article');
    applyTheme('light', letter);
    expect(letter.getAttribute('data-theme')).toBe('light');
    expect(root.hasAttribute('data-theme')).toBe(false);
    applyTheme('dark', letter);
    expect(letter.getAttribute('data-theme')).toBe('dark');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('a stored garbage theme falls back to vellum', async () => {
    stubScheme(false);
    root.setAttribute('data-theme', 'dark');
    const kv = memoryKV();
    kv.set(KEYS.theme, 'sepia"><img src=x>');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.choice).toBe('light'));
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(result.current.resolved).toBe('light');
  });

  it('a device that prefers dark still opens in vellum', async () => {
    stubScheme(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(memoryKV()) });
    await waitFor(() => expect(result.current.choice).toBe('light'));
    expect(result.current.resolved).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('prerenders in vellum', () => {
    const html = renderToString(
      <KVProvider kv={memoryKV()}>
        <ThemeProvider>
          <Shown />
        </ThemeProvider>
      </KVProvider>,
    );
    expect(html).toContain('light/light');
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
    expect(root.getAttribute('data-theme')).toBe('dark');
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

/**
 * R18.20: the hero's sweep runs only after a reader changes a chip. A theme change restyles every wire too, so for
 * two frames <html> carries data-theme-swap, under which globals.css holds the weave's transitions back.
 */
describe('a theme change holds back the transitions of the weave', () => {
  let frames: FrameRequestCallback[] = [];
  const nextFrame = () => {
    const due = frames;
    frames = [];
    for (const f of due) f(performance.now());
  };
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    root.removeAttribute(THEME_SWAP_ATTR);
  });

  it('marks <html> while the new theme is styled, and for two frames only', () => {
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(true);
    nextFrame();
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(true);
    nextFrame();
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(false);
    applyTheme('dark');
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(true);
    nextFrame();
    nextFrame();
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(false);
  });

  it('keeps the mark for two frames after the last of quick changes', () => {
    applyTheme('light');
    nextFrame();
    applyTheme('system');
    nextFrame();
    // Two frames after the first change, one after the second: the second is still being styled.
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(true);
    nextFrame();
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(false);
  });

  it('marks nothing when the theme stays, nor for a scoped element', () => {
    // The boot script leaves <html> in night when storage holds it; choosing night again changes nothing.
    root.setAttribute('data-theme', 'dark');
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(false);
    const letter = document.createElement('article');
    applyTheme('light', letter);
    expect(letter.hasAttribute(THEME_SWAP_ATTR)).toBe(false);
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it('marks <html> when match device follows the device to another colour scheme', async () => {
    const scheme = stubScheme(false);
    const kv = memoryKV();
    kv.set(KEYS.theme, 'system');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.choice).toBe('system'));
    nextFrame();
    nextFrame();
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(false);
    act(() => scheme.set(true));
    expect(result.current.resolved).toBe('light');
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(true);
    nextFrame();
    nextFrame();
    expect(root.hasAttribute(THEME_SWAP_ATTR)).toBe(false);
  });
});
