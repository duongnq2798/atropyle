// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LIMITS } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { BRANCH_BG } from '../../src/thread/branches';

const CSS_FILE = fileURLToPath(new URL('../../src/app/globals.css', import.meta.url));
const css = () => readFileSync(CSS_FILE, 'utf8');

/** The `--atro-*` colours declared in the first rule after a `/* tokens:<name> *\/` marker. */
function tokens(marker: string): Record<string, string> {
  const text = css();
  const at = text.indexOf(`/* tokens:${marker} */`);
  if (at < 0) throw new Error(`marker tokens:${marker} not found`);
  const first = text.indexOf('--atro-', at);
  const body = text.slice(first, text.indexOf('}', first));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--atro-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

/** sRGB channels of #rrggbb, linearised. */
function linear(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return [r, g, b];
}

function luminance(hex: string): number {
  const [r, g, b] = linear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** OKLab (Björn Ottosson, 2020): how far apart two colours look, beyond their contrast. */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = linear(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function apart(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** WCAG 2.x contrast ratio. */
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** One colour per heir (spec §18.4.2 T6): branch 1 is the thread. */
const BRANCHES = Array.from({ length: LIMITS.maxHeirs }, (_, i) => `branch-${i + 1}`);
const NAMES = [
  'bg',
  'surface-1',
  'surface-2',
  'surface-3',
  'ink',
  'ink-muted',
  'thread',
  'on-thread',
  'alive',
  'grace',
  'recovery',
  'release',
  'danger',
  'on-danger',
  'line',
  'line-strong',
  ...BRANCHES,
];
const SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3'];
const TEXT = ['ink', 'ink-muted', 'thread', 'alive', 'grace', 'recovery', 'release', 'danger'];

describe('colour tokens', () => {
  it('declares the same twenty-one colours for both themes, and the system light block equals the light block', () => {
    expect(Object.keys(tokens('dark')).sort()).toEqual([...NAMES].sort());
    expect(Object.keys(tokens('light')).sort()).toEqual([...NAMES].sort());
    expect(tokens('light-system')).toEqual(tokens('light'));
  });

  it('maps every token to a Tailwind colour', () => {
    for (const n of NAMES) expect(css(), n).toContain(`--color-${n}: var(--atro-${n});`);
  });

  it('paints the heirs with the branch tokens, one Tailwind class per heir', () => {
    expect(BRANCH_BG).toEqual(BRANCHES.map((b) => `bg-${b}`));
  });

  for (const theme of ['dark', 'light'] as const) {
    describe(theme, () => {
      const t = () => tokens(theme);

      it('every text colour reaches AA (4.5:1) on every surface', () => {
        for (const fg of TEXT)
          for (const bg of SURFACES) {
            expect(contrast(t()[fg], t()[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
      });

      it('body text on the background reaches AAA (7:1)', () => {
        expect(contrast(t().ink, t().bg)).toBeGreaterThanOrEqual(7);
      });

      it('text on filled buttons reaches AA', () => {
        expect(contrast(t()['on-thread'], t().thread)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t()['on-danger'], t().danger)).toBeGreaterThanOrEqual(4.5);
      });

      it('every heir branch reaches 3:1 on every surface, branch 1 is the thread, and no two look alike', () => {
        expect(t()['branch-1']).toBe(t().thread);
        for (const b of BRANCHES)
          for (const bg of SURFACES) {
            expect(contrast(t()[b], t()[bg]), `${b} on ${bg}`).toBeGreaterThanOrEqual(3);
          }
        for (const [i, a] of BRANCHES.entries())
          for (const b of BRANCHES.slice(i + 1)) {
            expect(apart(t()[a], t()[b]), `${a} and ${b}`).toBeGreaterThanOrEqual(0.12);
          }
      });

      it('control borders and the focus ring reach 3:1 on every surface (WCAG 1.4.11)', () => {
        for (const bg of SURFACES) {
          expect(contrast(t()['line-strong'], t()[bg]), `line-strong on ${bg}`).toBeGreaterThanOrEqual(3);
          expect(contrast(t().thread, t()[bg]), `focus ring on ${bg}`).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }
});
