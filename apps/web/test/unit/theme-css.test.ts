// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS_FILE = fileURLToPath(new URL('../../src/app/globals.css', import.meta.url));
const CSS = readFileSync(CSS_FILE, 'utf8').replaceAll('\r\n', '\n');

/** The declarations of the first rule written as `<selector> {`, searched from `from`. */
function decls(selector: string, from = 0): Record<string, string> {
  const at = CSS.indexOf(`${selector} {`, from);
  if (at < 0) throw new Error(`no rule "${selector}" after offset ${from}`);
  const open = at + selector.length + 2;
  const out: Record<string, string> = {};
  for (const d of CSS.slice(open, CSS.indexOf('}', open)).split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return out;
}

/** The rules of the `@layer base` block as [selector, body], comments dropped; its rules hold no nested braces. */
function baseRules(): Array<[string, string]> {
  const open = CSS.indexOf('{', CSS.indexOf('@layer base {'));
  let depth = 0;
  let end = open;
  for (; end < CSS.length; end++) {
    if (CSS[end] === '{') depth++;
    else if (CSS[end] === '}' && --depth === 0) break;
  }
  const inner = CSS.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, '');
  return [...inner.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [(m[1] ?? '').trim(), m[2] ?? '']);
}

describe('theme stylesheet', () => {
  it('base rules read the theme tokens themselves, so scoped vellum gets its own focus ring and selection', () => {
    // --color-* resolves once on :root and is inherited with night's value; only the html rule, which sits on :root
    // with the page's data-theme, may read it.
    const rules = baseRules();
    expect(rules.map(([selector]) => selector)).toEqual(
      expect.arrayContaining(['html', '::selection', ':focus-visible']),
    );
    expect(rules.filter(([selector, body]) => selector !== 'html' && body.includes('var(--color-'))).toEqual([]);
    const base = CSS.indexOf('@layer base {');
    expect(decls(':focus-visible', base)).toEqual({ outline: '2px solid var(--atro-thread)', 'outline-offset': '2px' });
    expect(decls('::selection', base)).toEqual({
      'background-color': 'color-mix(in oklab, var(--atro-thread) 35%, transparent)',
    });
  });

  it('night is :root with no attribute; vellum is an attribute any element can carry', () => {
    expect(decls('/* tokens:dark */\n:root,\n[data-theme="dark"]')['color-scheme']).toBe('dark');
    expect(decls('/* tokens:light */\n[data-theme="light"]')['color-scheme']).toBe('light');
    // A scoped vellum element paints its own paper and ink instead of inheriting night's.
    expect(decls('[data-theme="light"]', CSS.indexOf('@layer base {'))).toEqual({
      'background-color': 'var(--atro-bg)',
      color: 'var(--atro-ink)',
    });
  });

  it('match device turns vellum only for data-theme="system", inside the light media query', () => {
    expect(CSS).toContain(
      '/* tokens:light-system */\n@media (prefers-color-scheme: light) {\n  :root[data-theme="system"] {',
    );
    expect(decls(':root[data-theme="system"]')['color-scheme']).toBe('light');
    expect(CSS).not.toContain(':not([data-theme])');
  });

  it('the shared thread keeps its height, and the header and the footer stay put between pages', () => {
    expect(decls('::view-transition-old(atropyle-thread),\n::view-transition-new(atropyle-thread)')).toEqual({
      height: '100%',
      width: 'auto',
      'object-fit': 'none',
      'object-position': 'left center',
    });
    expect(decls('::view-transition-image-pair(atropyle-thread)')).toEqual({ overflow: 'clip' });
    expect(decls('.site-header')).toEqual({ 'view-transition-name': 'site-header' });
    expect(decls('.site-footer')).toEqual({ 'view-transition-name': 'site-footer' });
  });

  it('while an overlay or a popover is on screen, the header and the footer stay in the root picture, under it', () => {
    // A named group paints above the root, and the open sheet, its dimming and the popover are in the root. Mounted
    // is enough: a sheet that is closing stays until the transition has run (its exit animation waits for it).
    expect(decls(':root:has(:is(.atro-overlay, .atro-pop)) :is(.site-header, .site-footer)')).toEqual({
      'view-transition-name': 'none',
    });
  });

  it('under reduced motion a view transition is a 120 ms crossfade where nothing moves, the root included', () => {
    const reduce = CSS.indexOf('@media (prefers-reduced-motion: reduce) {');
    expect(reduce).toBeGreaterThan(CSS.indexOf('::view-transition-old(root),\n::view-transition-new(root) {'));
    expect(decls('::view-transition-group(*)', reduce)).toEqual({ animation: 'none' });
    // `(root)` outranks `(*)` (a name counts as a type selector, `*` as nothing), so the root's 240 ms is
    // overridden by name, after it.
    expect(
      decls(
        '::view-transition-old(*),\n  ::view-transition-new(*),\n  ::view-transition-old(root),\n  ::view-transition-new(root)',
        reduce,
      ),
    ).toEqual({ 'animation-duration': '120ms', 'animation-timing-function': 'linear' });
  });
});
