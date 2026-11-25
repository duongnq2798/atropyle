// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');

describe('the weave of the home hero (R18.4)', () => {
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
});
