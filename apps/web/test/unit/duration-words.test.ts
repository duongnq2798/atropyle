import { afterEach, describe, expect, it, vi } from 'vitest';
import { durationWords } from '../../src/lib/duration';

const UNIT = { day: 86_400, hour: 3_600, minute: 60, second: 1 } as const;
const COUNTS = [0, 1, 2, 3, 7, 10, 21, 59, 180, 999, 1_000, 1_001, 12_345, 999_999, 1_234_567];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('durationWords without Intl (7C-F1)', () => {
  it('writes exactly what Intl writes, in both languages, for every unit and size', () => {
    for (const [lang, locale] of [
      ['en', 'en'],
      ['vi', 'vi-VN'],
    ] as const) {
      for (const [unit, seconds] of Object.entries(UNIT)) {
        const intl = new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' });
        for (const n of COUNTS) {
          // The largest whole unit: 60 minutes read as 1 hour, so a count that rolls over is checked in its own unit.
          const s = n * seconds;
          const largest = Object.entries(UNIT).find(([, u]) => s > 0 && s % u === 0) ?? ['second', 1];
          if (largest[0] !== unit) continue;
          expect(durationWords(s, lang), `${lang} ${n} ${unit}`).toBe(intl.format(n));
        }
      }
    }
  });

  it('reads a bigint and a fraction as before', () => {
    expect(durationWords(600n, 'en')).toBe('10 minutes');
    expect(durationWords(1.5, 'en')).toBe(
      new Intl.NumberFormat('en', { style: 'unit', unit: 'second', unitDisplay: 'long' }).format(1.5),
    );
  });

  it('builds no Intl.NumberFormat for a whole number of units: the first one loads ICU data on the main thread', () => {
    const intl = vi.spyOn(Intl, 'NumberFormat');
    for (const s of [600, 86_400, 3 * 86_400, 129_600, 45, 0]) {
      durationWords(s, 'en');
      durationWords(s, 'vi');
    }
    expect(intl).not.toHaveBeenCalled();
  });
});
