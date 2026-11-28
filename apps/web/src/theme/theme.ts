export type ThemeChoice = 'dark' | 'light' | 'system';
/** Night, vellum, match device: the order of the theme switch (R18.1). */
export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'system'];
/** Night whatever the device prefers (R18.1). It needs no attribute: `:root` carries the night tokens. */
export const DEFAULT_THEME = 'dark' as const satisfies ThemeChoice;

/** Only an exact choice counts; anything else is night (Review Focus 2: storage may hold garbage). */
export function parseTheme(raw: string | null | undefined): ThemeChoice {
  return raw === 'light' || raw === 'system' || raw === 'dark' ? raw : DEFAULT_THEME;
}

const listeners = new Set<() => void>();

/** The theme in force is the `data-theme` attribute of <html>; the boot script sets it before the first paint. */
export function readThemeAttr(): ThemeChoice {
  return parseTheme(document.documentElement.getAttribute('data-theme'));
}

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Set on <html> while a new theme is being styled. A theme change recolours every wire of the hero's weave, and its
 * colour transitions are the sweep that only a reader's chip may start (R18.20): globals.css holds them back under
 * this attribute.
 */
export const THEME_SWAP_ATTR = 'data-theme-swap';

let swap = 0;

/**
 * Marks <html> for the frame that styles the new theme and the one after it; a later change restarts the count.
 * Without requestAnimationFrame (no rendering), nothing is styled and nothing is marked.
 */
export function holdThemeTransitions(): void {
  if (typeof requestAnimationFrame !== 'function') return;
  const html = document.documentElement;
  const mine = ++swap;
  html.setAttribute(THEME_SWAP_ATTR, '');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (mine === swap) html.removeAttribute(THEME_SWAP_ATTR);
    }),
  );
}

/**
 * Night removes the attribute; vellum and match device set it (Quyết định 14). `root` may be any element:
 * `data-theme="light"` on a letter or a print sheet makes just that element vellum. `system` means something only
 * on <html>, where the stylesheet's media query reads it. A change on <html> holds the weave's transitions back.
 */
export function applyTheme(choice: ThemeChoice, root: HTMLElement = document.documentElement): void {
  const next = choice === 'dark' ? null : choice;
  if (root === document.documentElement && root.getAttribute('data-theme') !== next) holdThemeTransitions();
  if (next === null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', next);
  for (const l of listeners) l();
}
