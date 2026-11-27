// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEPTHS } from '../../src/home/netlist-geometry';
import { THEME_SWAP_ATTR } from '../../src/theme/theme';

// The home page's rules: src/home/home.css, a module apart from globals.css, imported by the layout after it.
const CSS = readFileSync(fileURLToPath(new URL('../../src/home/home.css', import.meta.url)), 'utf8');
const SVG = readFileSync(fileURLToPath(new URL('../../src/home/weave-svg.tsx', import.meta.url)), 'utf8');

describe('the weave of the home hero (R18.4, R18.20)', () => {
  it('moves only its sweep boxes, by transform, and only without a reduced-motion preference', () => {
    for (const name of ['weave-open', 'weave-hold']) {
      const at = CSS.indexOf(`@keyframes ${name} {`);
      expect(at, name).toBeGreaterThan(0);
      const body = CSS.slice(at, CSS.indexOf('\n}\n', at));
      expect(
        [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]),
        name,
      ).toEqual(['transform']);
    }
    const uses = [...CSS.matchAll(/animation:\s*weave-/g)].map((m) => m.index ?? 0);
    expect(uses).toHaveLength(2);
    const block = CSS.lastIndexOf('@media (prefers-reduced-motion: no-preference) {', uses[0]);
    expect(block).toBeGreaterThan(CSS.indexOf('.weave {'));
    // Both inside that one block: no top-level rule closes between its start and the second use.
    expect(CSS.slice(block, uses[1])).not.toContain('\n}\n');
  });

  it('lights a question through :has(), with the data-ask fallback only inside @supports not selector(:has(*))', () => {
    for (const l of ['a', 's', 'l']) {
      expect(CSS).toContain(`.hero:has(.ask-chip input[value="${l}"]:checked) .weave-col [data-v~="${l}"]`);
      expect(CSS).toContain(`.hero:has(.ask-chip input[value="${l}"]:checked) .ask-answer > [data-for="${l}"]`);
      expect(CSS).toContain(`.hero:has(.ask-chip input[value="${l}"]:checked) .weave-pin[data-open~="${l}"]`);
    }
    const at = CSS.indexOf('@supports not selector(:has(*)) {');
    expect(at).toBeGreaterThan(0);
    const end = CSS.indexOf('\n}\n', at);
    const fallback = CSS.slice(at, end);
    for (const l of ['a', 's', 'l']) {
      expect(fallback).toContain(`.hero[data-ask="${l}"] .weave-col [data-v~="${l}"]`);
      expect(fallback).toContain(`.hero[data-ask="${l}"] .ask-answer > [data-for="${l}"]`);
    }
    // Nowhere else: with both, a chip pressed before hydration would light two questions (ruling R12).
    expect(CSS.slice(0, at) + CSS.slice(end)).not.toContain('[data-ask=');
  });

  it('sweeps by depth in at most 1.3 s after a chip changes, and only without a reduced-motion preference', () => {
    const uses = [
      ...CSS.matchAll(/transition:\s*(stroke|border-color)\s+(\d+)ms\s+linear\s+calc\(var\(--d\)\s*\*\s*(\d+)ms\)/g),
    ];
    expect(uses.map((m) => m[1]).sort()).toEqual(['border-color', 'stroke']);
    for (const m of uses) {
      expect(Number(m[3]) * DEPTHS + Number(m[2]), m[0]).toBeLessThanOrEqual(1300);
      const block = CSS.lastIndexOf('@media (prefers-reduced-motion: no-preference) {', m.index);
      expect(block, m[0]).toBeGreaterThan(0);
      expect(CSS.slice(block, m.index), m[0]).not.toContain('\n}\n');
    }
  });

  it('holds the sweep back while a theme change is styled: only a chip starts it', () => {
    const at = CSS.indexOf(`:root[${THEME_SWAP_ATTR}] .weave :is(.weave-col path, .weave-pin) {`);
    expect(at).toBeGreaterThan(0);
    expect(CSS.slice(at, CSS.indexOf('}', at))).toMatch(/\{\s*transition: none;\s*$/);
  });

  it('draws an unlit wire at 55 % and a lit one in the full thread colour: no opacity on the group', () => {
    expect(CSS).toMatch(/\n\.weave-col path \{\n {2}stroke: color-mix\(in oklab, currentColor 55%, transparent\);\n\}/);
    const lit = [...CSS.matchAll(/\.weave-col \[data-v~="[asl]"\][,\s]*(?:\{\s*stroke: ([^;]+);)?/g)]
      .map((m) => m[1])
      .filter(Boolean);
    expect(lit).toEqual(['var(--atro-thread)', 'var(--atro-thread)']);
    expect(SVG).not.toMatch(/opacity=\{0\.55\}/);
  });
});
