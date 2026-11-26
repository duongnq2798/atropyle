import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const FAVICON = read('../../public/favicon.svg');
/** The web v2 site icon: the arch mark that the share card (apps/web/share/og.png) shows too. */
const V2_ICON = read('../../../web/src/app/icon.svg');

/** The `d` of every `<path>`, in document order. */
const paths = (svg: string) => [...svg.matchAll(/<path\b[^>]*?\sd="([^"]*)"/g)].map((m) => m[1]);

/** The attribute `name` of the first `<tag>`, lowercased. Throws when it is missing, so two blanks never match. */
function attr(svg: string, tag: string, name: string): string {
  const value = svg.match(new RegExp(String.raw`<${tag}\b[^>]*?\s${name}="([^"]*)"`))?.[1];
  if (value === undefined) throw new Error(`<${tag} ${name}> not found`);
  return value.toLowerCase();
}

describe('favicon.svg', () => {
  it('draws the arch mark of web v2: one stroke, the same path, box and colours', () => {
    expect(paths(FAVICON)).toHaveLength(1);
    expect(paths(FAVICON)).toEqual(paths(V2_ICON));
    expect(attr(FAVICON, 'svg', 'viewBox')).toBe(attr(V2_ICON, 'svg', 'viewBox'));
    for (const [tag, name] of [
      ['rect', 'rx'],
      ['rect', 'fill'],
      ['path', 'stroke'],
    ] as const) {
      expect(attr(FAVICON, tag, name), `${tag} ${name}`).toBe(attr(V2_ICON, tag, name));
    }
  });

  it('strokes the arch 3 units wide: 2 px in a 16 px tab, where the 2 units of the v2 icon blur to 1.3 px', () => {
    expect(attr(FAVICON, 'path', 'stroke-width')).toBe('3');
  });

  it('refers to nothing outside the file', () => {
    expect(FAVICON).not.toMatch(/currentColor|href|url\(|<(image|use|script|style|foreignObject)\b/i);
    expect(FAVICON.match(/[a-z]+:\/\/[^\s"']+/gi)).toEqual(['http://www.w3.org/2000/svg']);
  });
});
