import { describe, expect, it } from 'vitest';
import { BUTTON, contrast, DARK, LIGHT, TONES } from '../../src/email/theme';

describe('email palette (spec §4.3, §11 contrast row)', () => {
  for (const [name, p] of [
    ['light', LIGHT],
    ['dark', DARK],
  ] as const) {
    it(`${name}: ink and muted text reach WCAG AA (4.5:1) on every surface`, () => {
      for (const fg of ['ink', 'muted'] as const) {
        for (const bg of ['bg', 'surface1', 'surface2'] as const) {
          expect(contrast(p[fg], p[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it(`${name}: every tone reaches 3:1 as a graphic (thread, dot) on every surface`, () => {
      for (const tone of TONES) {
        for (const bg of ['bg', 'surface1', 'surface2'] as const) {
          expect(contrast(p[tone], p[bg]), `${tone} on ${bg}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it('the button text reads at AA in both themes', () => {
    expect(contrast(BUTTON.text, BUTTON.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('computes the WCAG ratio', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});
