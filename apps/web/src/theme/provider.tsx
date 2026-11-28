'use client';

import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useKV } from '@/lib/kv';
import { KEYS } from '@/lib/store';
import {
  applyTheme,
  DEFAULT_THEME,
  holdThemeTransitions,
  parseTheme,
  readThemeAttr,
  subscribeTheme,
  type ThemeChoice,
} from './theme';

interface ThemeValue {
  choice: ThemeChoice;
  /** What the page shows now: night or vellum, or under match device the device's colour scheme. */
  resolved: 'light' | 'dark';
  setChoice(c: ThemeChoice): void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const LIGHT = '(prefers-color-scheme: light)';

/** Under match device, the device's new colour scheme restyles the page: hold the weave's transitions back too. */
function subscribeScheme(cb: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(LIGHT);
  const changed = () => {
    if (readThemeAttr() === 'system') holdThemeTransitions();
    cb();
  };
  mql.addEventListener('change', changed);
  return () => mql.removeEventListener('change', changed);
}

function prefersLight(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(LIGHT).matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const kv = useKV();
  // The prerendered page is vellum: the HTML carries no theme attribute and :root is vellum (7C-T12).
  const choice = useSyncExternalStore(subscribeTheme, readThemeAttr, () => DEFAULT_THEME);
  const light = useSyncExternalStore(subscribeScheme, prefersLight, () => false);

  // The boot script already did this; doing it again keeps a page whose inline script was blocked correct.
  useEffect(() => {
    applyTheme(parseTheme(kv.get(KEYS.theme)));
  }, [kv]);

  const setChoice = useCallback(
    (c: ThemeChoice) => {
      kv.set(KEYS.theme, c);
      applyTheme(c);
    },
    [kv],
  );

  const value = useMemo<ThemeValue>(
    () => ({ choice, resolved: choice === 'system' ? (light ? 'light' : 'dark') : choice, setChoice }),
    [choice, light, setChoice],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeValue {
  const v = use(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}
