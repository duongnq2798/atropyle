// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = (rel: string) => readFileSync(fileURLToPath(new URL(`../../src/${rel}`, import.meta.url)), 'utf8');

/** Motion's packages: any value import from them, other than the lazy `m` components, brings the animation engine. */
const MOTION = /^(?:motion|framer-motion|motion-dom)(?:\/|$)/;
/** The lazy m components, from their own entry point, and LazyMotion. */
const LAZY = new Set(['motion/react-m: * as m', 'motion/react: LazyMotion']);
const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

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
        for (const name of names)
          expect(LAZY.has(`${from}: ${name}`), `${file} imports ${name} from ${from}`).toBe(true);
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
    expect(motionImports('ui/hold-button.tsx')).toEqual([{ from: 'motion/react-m', names: ['* as m'] }]);
  });
});

describe('the motion features stay in their lazy chunk (ruling R23)', () => {
  // A static `import { m } from 'motion/react'` brings motion/react's own module into the first load, and with it
  // the `motion` proxy and every feature it carries: the import() in MotionProvider then loads nothing new.
  // test/build/first-load.test.ts checks the build itself.
  it('takes the m components from motion/react-m, and only MotionProvider takes anything from motion/react', () => {
    const all = files(SRC).map((f) => relative(SRC, f).split(sep).join('/'));
    const found = all.flatMap((file) => motionImports(file).map((i) => ({ file, ...i })));
    expect(found.filter((i) => i.from === 'motion/react')).toEqual([
      { file: 'motion/provider.tsx', from: 'motion/react', names: ['LazyMotion', 'MotionConfig'] },
    ]);
    for (const i of found.filter((x) => x.from !== 'motion/react')) {
      expect(i, i.file).toMatchObject({ from: 'motion/react-m', names: ['* as m'] });
    }
    expect(found.length).toBeGreaterThan(5);
  });

  it('loads domMax only through the re-export that MotionProvider imports', () => {
    expect(source('motion/features.ts')).toMatch(/^export \{ domMax as default \} from 'motion\/react';$/m);
    expect(source('motion/provider.tsx')).toContain("import('./features')");
  });
});
