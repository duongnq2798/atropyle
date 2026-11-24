// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StateGlyph } from '../../src/thread/glyphs';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ICON = read('../../src/app/icon.svg');

/** The `d` of every `<path>`, in document order. */
const paths = (svg: string) => [...svg.matchAll(/<path\b[^>]*?\sd="([^"]*)"/g)].map((m) => m[1]);

/** The attribute `name` of the first `<tag>`. */
const attr = (svg: string, tag: string, name: string) =>
  svg.match(new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`))?.[1];

/** A night colour: the first rule after the `tokens:dark` marker of globals.css, read as contrast.test.ts reads it. */
function night(token: string): string {
  const css = read('../../src/app/globals.css');
  const at = css.indexOf('/* tokens:dark */');
  if (at < 0) throw new Error('marker tokens:dark not found');
  const first = css.indexOf('--atro-', at);
  const block = css.slice(first, css.indexOf('}', first));
  const value = block.match(new RegExp(`--atro-${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`))?.[1];
  if (!value) throw new Error(`--atro-${token} not found after tokens:dark`);
  return value.toLowerCase();
}

describe('icon.svg', () => {
  it('draws the mark of the Wordmark: one stroke, the same path, the same 24 × 24 box', () => {
    const glyph = renderToString(<StateGlyph name="mark" />);
    expect(paths(ICON)).toHaveLength(1);
    expect(paths(ICON)).toEqual(paths(glyph));
    expect(attr(ICON, 'svg', 'viewBox')).toBe(attr(glyph, 'svg', 'viewBox'));
  });

  it('paints the night colours itself and refers to nothing outside the file', () => {
    // A favicon has no page around it: currentColor would be black, and any reference would be a request.
    expect(attr(ICON, 'rect', 'fill')?.toLowerCase()).toBe(night('bg'));
    expect(attr(ICON, 'path', 'stroke')?.toLowerCase()).toBe(night('thread'));
    expect(ICON).not.toMatch(/currentColor|href|url\(|<(image|use|script|style|foreignObject)\b/i);
    expect(ICON.match(/[a-z]+:\/\/[^\s"']+/gi)).toEqual(['http://www.w3.org/2000/svg']);
  });
});
