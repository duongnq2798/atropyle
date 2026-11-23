// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DURATION, HOLD_MS, SPRING, SPRING_MS, springAt, springStops } from '../../src/motion/tokens';

const css = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');

describe('motion tokens (spec §4.4)', () => {
  it('has the five durations, the spring and the 600 ms hold', () => {
    expect(DURATION).toEqual({ instant: 90, quick: 160, base: 240, slow: 420, story: 720 });
    expect(SPRING).toMatchObject({ stiffness: 380, damping: 32, mass: 1 });
    expect(HOLD_MS).toBe(600);
  });

  it('springAt is the closed form of the spring: starts at rest, overshoots about 1 %, settles at 1', () => {
    expect(springAt(0)).toBe(0);
    const peak = Math.max(...Array.from({ length: 500 }, (_, i) => springAt(i / 1000)));
    expect(peak).toBeGreaterThan(1.01);
    expect(peak).toBeLessThan(1.012);
    expect(Math.abs(springAt(SPRING_MS / 1000) - 1)).toBeLessThan(0.0015);
    expect(Math.abs(springAt(2) - 1)).toBeLessThan(1e-9);
  });

  it('the CSS --ease-spring stops are the spring sampled 25 times over 443 ms (Quyết định 11)', () => {
    const m = /--ease-spring:\s*linear\(([^)]*)\)/.exec(css);
    expect(m).not.toBeNull();
    const stops = (m?.[1] ?? '').split(',').map((s) => Number(s.trim()));
    expect(stops).toEqual(springStops());
    for (let i = 0; i < 24; i++) {
      expect(Math.abs(stops[i] - springAt((i * SPRING_MS) / 1000 / 24)), `stop ${i}`).toBeLessThan(0.0006);
    }
    expect(stops[24]).toBe(1);
  });
});
