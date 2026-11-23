export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/** Anything but an exact `light` or `dark` is `system` (Review Focus 2: storage may hold garbage). */
export function parseTheme(raw: string | null | undefined): ThemeChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

const listeners = new Set<() => void>();

/** The theme in force is the `data-theme` attribute of <html>; boot-script.tsx sets it before the first paint. */
export function readThemeAttr(): ThemeChoice {
  return parseTheme(document.documentElement.getAttribute('data-theme'));
}

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** `system` removes the attribute so the CSS media query decides (Quyết định 14). */
export function applyTheme(choice: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  for (const l of listeners) l();
}
