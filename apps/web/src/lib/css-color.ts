export type Rgb = [number, number, number];

/** `#rrggbb` only: the theme tokens of globals.css are written that way, and a custom property keeps its text. */
export function parseHexColor(raw: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(raw.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The value of a CSS custom property where `el` sits, so a scoped vellum element reads vellum; '' when the
 * property is not set (unit tests load no stylesheet).
 */
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
