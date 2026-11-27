import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const CSS = read('../../src/styles.css');
const HTML = read('../../index.html');

/** The body of every rule whose selector names `:root` (`:root`, `:root[data-theme]`, `:root:not(...)`). */
const rootBlocks = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').includes(':root'))
    .map((m) => m[2] ?? '');

/** The custom properties of a block, as a name to lowercased value map. */
const tokens = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], (m[2] ?? '').trim().toLowerCase()]),
  );

// The light Vellum palette of web v2: the only theme of the site (a decision of the maintainer on 26 Nov 2026).
const VELLUM = {
  '--bg': '#f6f1e7',
  '--card': '#fffdf8',
  '--fg': '#16130f',
  '--muted': '#5e574c',
  '--line': '#ddd3c2',
  '--line-strong': '#80766a',
  '--accent': '#86590e',
  '--on-accent': '#fffdf8',
  '--ok': '#106f5a',
  '--warn': '#945100',
  '--bad': '#b42318',
};

describe('the light-only theme', () => {
  it('has no dark mode: no prefers-color-scheme query and no dark color-scheme anywhere', () => {
    expect(CSS).not.toMatch(/prefers-color-scheme/);
    expect(CSS).not.toMatch(/color-scheme\s*:[^;]*\bdark\b/);
    expect(HTML).not.toMatch(/\bdark\b/);
  });

  it('declares one :root block that opts out of dark schemes and the browser forced dark', () => {
    const blocks = rootBlocks(CSS);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(/color-scheme\s*:\s*only light\s*;/);
  });

  it('says only light in the color-scheme meta of index.html too', () => {
    const metas = [...HTML.matchAll(/<meta\b[^>]*\bname="color-scheme"[^>]*>/g)].map((m) => m[0]);
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatch(/\bcontent="only light"/);
  });

  it('uses the Vellum tokens of web v2', () => {
    const found = tokens(rootBlocks(CSS)[0] ?? '');
    for (const [name, value] of Object.entries(VELLUM)) expect(found[name], name).toBe(value);
  });

  it('draws its own focus ring in --fg, never the browser default, and never removes it', () => {
    expect(CSS).toMatch(/(^|\n):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fg\);[^}]*outline-offset:\s*2px;/);
    expect(CSS).not.toMatch(/outline(-style)?\s*:\s*(none|0)\b/);
  });

  it('colours placeholders with --muted at full opacity, never the browser grey', () => {
    expect(CSS).toMatch(/::placeholder\s*\{[^}]*color:\s*var\(--muted\);[^}]*opacity:\s*1;/);
  });
});
