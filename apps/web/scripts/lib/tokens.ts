import { readFileSync } from 'node:fs';

/** globals.css, where each theme keeps its colours in the first rule after a `/* tokens:<name> *\/` marker. */
export const GLOBALS_CSS = new URL('../../src/app/globals.css', import.meta.url);

/**
 * The `--atro-*` colours of a theme, by name without the prefix (`bg`, `ink`, `thread` …), lowercased: read the way
 * test/unit/contrast.test.ts reads them, so the share card and the manifest take the site's own colours.
 */
export function themeTokens(
  marker: 'dark' | 'light',
  css: string = readFileSync(GLOBALS_CSS, 'utf8'),
): Record<string, string> {
  const at = css.indexOf(`/* tokens:${marker} */`);
  if (at < 0) throw new Error(`marker tokens:${marker} not found in globals.css`);
  const first = css.indexOf('--atro-', at);
  const body = css.slice(first, css.indexOf('}', first));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--atro-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}
