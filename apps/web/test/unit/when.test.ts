import { describe, expect, it } from 'vitest';
import { chainDate, isoDate, roughDuration } from '../../src/lib/when';

const T0 = 1_795_336_070n; // 2026-11-22T08:27:50Z, the e2e preview's "now"

describe('roughDuration', () => {
  it('says a duration in the largest unit it holds at least two of, rounded', () => {
    expect(roughDuration(180 * 86_400, 'en')).toBe('6 months');
    expect(roughDuration(180 * 86_400, 'vi')).toBe('6 tháng');
    expect(roughDuration(14 * 86_400, 'en')).toBe('14 days');
    expect(roughDuration(14 * 86_400, 'vi')).toBe('14 ngày');
    expect(roughDuration(450 * 86_400, 'en')).toBe('15 months');
    expect(roughDuration(800 * 86_400, 'en')).toBe('2 years');
    expect(roughDuration(1_068, 'en')).toBe('18 minutes');
    expect(roughDuration(110, 'en')).toBe('110 seconds');
    expect(roughDuration(110, 'vi')).toBe('110 giây');
    expect(roughDuration(1, 'en')).toBe('1 second');
  });
});

describe('chainDate', () => {
  it('says a chain time as a date in UTC, with the time of day when asked', () => {
    expect(chainDate(T0 + 180n * 86_400n, 'en', false)).toBe('21 May 2027');
    expect(chainDate(T0 + 180n * 86_400n, 'vi', false)).toBe('21 tháng 5, 2027');
    expect(chainDate(T0 + 1_068n, 'en', true)).toBe('22 November 2026, 08:45 UTC');
    expect(chainDate(1_000n, 'en', true)).toBe('1 January 1970, 00:16 UTC');
    expect(isoDate(T0)).toBe('2026-11-22T08:27:50.000Z');
  });
});
