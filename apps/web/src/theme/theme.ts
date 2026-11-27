export type ThemeChoice = 'dark' | 'light' | 'system';
/** Vellum, night, match device: the order of the theme switch, the default first (7C-T12 Ruling 9). */
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
/**
 * Vellum whatever the device prefers: the maintainer's decision of 26 Nov 2026 (night read as less trustworthy and
 * harder to read), applied at the cutover. `:root` carries the vellum tokens, so it holds before the boot script runs.
 */
export const DEFAULT_THEME = 'light' as const satisfies ThemeChoice;

/** Only an exact choice counts; anything else is vellum (Review Focus 2: storage may hold garbage). */
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
 * Every choice sets the attribute, as the boot script does (7C-T12): the `[data-theme=light]` variants read it, and night
 * is `[data-theme="dark"]` now that `:root` is vellum. `root` may be any element: `data-theme="light"` on a letter or a
 * print sheet makes just that element vellum. `system` means something only on <html>, where the stylesheet's media
 * query reads it. A change on <html> holds the weave's transitions back.
 */
export function applyTheme(choice: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (root === document.documentElement && root.getAttribute('data-theme') !== choice) holdThemeTransitions();
  root.setAttribute('data-theme', choice);
  for (const l of listeners) l();
}
