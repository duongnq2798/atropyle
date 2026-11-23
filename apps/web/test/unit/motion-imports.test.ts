// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = (rel: string) => readFileSync(fileURLToPath(new URL(`../../src/${rel}`, import.meta.url)), 'utf8');

/** Motion's packages: any value import from them, other than the lazy `m` components, brings the animation engine. */
const MOTION = /^(?:motion|framer-motion|motion-dom)(?:\/|$)/;
const LAZY = new Set(['m', 'LazyMotion']);

/** The value bindings each static import of `file` takes from Motion's packages (type-only imports carry no code). */
function motionImports(file: string): { from: string; names: string[] }[] {
  const out: { from: string; names: string[] }[] = [];
  for (const [, clause, from] of source(file).matchAll(/^import\s+([^'"]*?)\s*(?:from\s+)?['"]([^'"]+)['"]/gm)) {
    if (!MOTION.test(from) || /^type\s/.test(clause)) continue;
    const braces = /\{([^}]*)\}/.exec(clause)?.[1] ?? '';
    const named = braces
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '' && !s.startsWith('type '));
    // A default or namespace import, or a bare side-effect import, takes the whole module.
    const whole = clause
      .replace(/\{[^}]*\}/, '')
      .replace(/,/g, '')
      .trim();
    out.push({ from, names: whole === '' && clause !== '' ? named : [...named, whole || '(side effect)'] });
  }
  return out;
}

describe('the hold stays off the animation engine (first-load JS)', () => {
  for (const file of ['ui/hold-button.tsx', 'motion/use-hold.ts']) {
    it(`${file} imports only the lazy m components from Motion`, () => {
      for (const { from, names } of motionImports(file)) {
        for (const name of names) expect(LAZY.has(name), `${file} imports ${name} from ${from}`).toBe(true);
      }
      const code = source(file);
      expect(code).not.toMatch(/\buseAnimate\b/);
      expect(code).not.toMatch(/\banimate\s*\(/);
    });
  }

  it('shakes with a CSS keyframe that runs only when motion is allowed', () => {
    const css = source('app/globals.css');
    expect(css).toMatch(/--animate-shake:\s*atro-shake\s/);
    expect(css).toMatch(/@keyframes atro-shake\s*\{/);
    // Each class that applies the shake, with its variants: `motion-safe:data-shake:animate-shake`.
    const uses = [...source('ui/hold-button.tsx').matchAll(/([\w:-]*)animate-shake\b/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const prefix of uses) expect(prefix).toMatch(/^motion-safe:/);
  });

  it('reads the import clauses it guards', () => {
    expect(motionImports('motion/provider.tsx')).toEqual([
      { from: 'motion/react', names: ['LazyMotion', 'MotionConfig'] },
    ]);
  });
});
