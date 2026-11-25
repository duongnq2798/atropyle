// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio. */
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

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
];
const SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3'];
const TEXT = ['ink', 'ink-muted', 'thread', 'alive', 'grace', 'recovery', 'release', 'danger'];

describe('colour tokens', () => {
  it('declares the same sixteen colours for both themes, and the system light block equals the light block', () => {
    expect(Object.keys(tokens('dark')).sort()).toEqual([...NAMES].sort());
    expect(Object.keys(tokens('light')).sort()).toEqual([...NAMES].sort());
    expect(tokens('light-system')).toEqual(tokens('light'));
  });

  it('maps every token to a Tailwind colour', () => {
    for (const n of NAMES) expect(css(), n).toContain(`--color-${n}: var(--atro-${n});`);
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

      it('control borders and the focus ring reach 3:1 on every surface (WCAG 1.4.11)', () => {
        for (const bg of SURFACES) {
          expect(contrast(t()['line-strong'], t()[bg]), `line-strong on ${bg}`).toBeGreaterThanOrEqual(3);
          expect(contrast(t().thread, t()[bg]), `focus ring on ${bg}`).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }
});
