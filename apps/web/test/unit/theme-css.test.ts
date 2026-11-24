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

describe('theme stylesheet', () => {
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
});
