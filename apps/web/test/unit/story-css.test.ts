// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The home page's rules: src/home/home.css, a module apart from globals.css, imported by the layout after it.
const CSS = readFileSync(fileURLToPath(new URL('../../src/home/home.css', import.meta.url)), 'utf8');

describe('the story after the hero (7C-T7a, R18.4)', () => {
  it('moves the spine and the rise by transform alone, on a scroll timeline, only without a reduced-motion preference', () => {
    for (const name of ['spine-fill', 'spine-tie', 'story-rise']) {
      const at = CSS.indexOf(`@keyframes ${name} {`);
      expect(at, name).toBeGreaterThan(0);
      const body = CSS.slice(at, CSS.indexOf('\n}\n', at));
      expect(
        [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]),
        name,
      ).toEqual(['transform']);
    }
    const uses = [...CSS.matchAll(/animation:\s*(?:spine-fill|spine-tie|story-rise)\b/g)].map((m) => m.index ?? 0);
    expect(uses).toHaveLength(3);
    const media = CSS.lastIndexOf('@media (prefers-reduced-motion: no-preference) {', uses[0]);
    const supports = CSS.lastIndexOf('@supports (animation-timeline: view()) {', uses[0]);
    expect(media).toBeGreaterThan(CSS.indexOf('.spine-seg'));
    expect(supports).toBeGreaterThan(media);
    // All three inside that one block: no top-level rule closes between its start and the last use.
    expect(CSS.slice(media, uses[2])).not.toContain('\n}\n');
  });

  it('shows the spine only from 78rem, in the gutter left of the box, never inside it (fix round 1)', () => {
    const start = CSS.indexOf('\n.story {\n');
    const end = CSS.indexOf('@supports not (top: 1lh)', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const rules = CSS.slice(start, end);
    // One place for the line: 1.5rem left of the 72rem box, at every width it shows.
    expect(rules).toMatch(/^\n\.story \{\n {2}--spine-x: -1\.5rem;\n\}/);
    expect([...rules.matchAll(/--spine-x:\s*([^;]+);/g)].map((m) => m[1])).toEqual(['-1.5rem']);
    // Hidden by default; the one media query that shows it is the gutter's.
    expect(rules).toMatch(/\n\.spine-seg,\n\.spine-node \{\n {2}display: none;\n\}/);
    expect([...rules.matchAll(/@media \(min-width: ([^)]+)\)/g)].map((m) => m[1])).toEqual(['78rem']);
    const media = rules.indexOf('@media (min-width: 78rem) {');
    for (const selector of ['.story .spine-seg {', '.spine-fill {', '.story .spine-node {', '.spine-node > span {']) {
      expect(rules.indexOf(selector), selector).toBeGreaterThan(media);
    }
  });

  it('shows the language that <html lang> names and hides the other', () => {
    expect(CSS).toMatch(/\n\.say-vi \{\n {2}display: none;\n\}/);
    expect(CSS).toMatch(/\n:root:lang\(vi\) \.say-en \{\n {2}display: none;\n\}/);
    expect(CSS).toMatch(/\n:root:lang\(vi\) \.say-vi \{\n {2}display: inline;\n\}/);
  });
});
