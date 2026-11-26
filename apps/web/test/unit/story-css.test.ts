// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');

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

  it('shows the language that <html lang> names and hides the other', () => {
    expect(CSS).toMatch(/\n\.say-vi \{\n {2}display: none;\n\}/);
    expect(CSS).toMatch(/\n:root:lang\(vi\) \.say-en \{\n {2}display: none;\n\}/);
    expect(CSS).toMatch(/\n:root:lang\(vi\) \.say-vi \{\n {2}display: inline;\n\}/);
  });
});
