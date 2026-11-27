import { formatDuration } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import {
  chainNow,
  coveragePercent,
  formatAmount,
  formatBps,
  formatRemaining,
  formatTimestamp,
} from '../../src/lib/format';

describe('format', () => {
  it('formats token amounts without rounding up', () => {
    expect(formatAmount(1_234_567_890n, 6)).toBe('1,234.56789');
    expect(formatAmount(10n ** 24n, 18)).toBe('1,000,000');
    expect(formatAmount(1_999_999_999n, 9, 2)).toBe('1.99');
    expect(formatAmount(0n, 6)).toBe('0');
    expect(formatAmount(1n, 18)).toBe('<0.000001');
    expect(formatAmount(1234567n, null)).toBe('1,234,567');
    expect(formatAmount(5n, 0)).toBe('5');
  });

  it('formats basis points as percent', () => {
    expect(formatBps(7000)).toBe('70%');
    expect(formatBps(3333)).toBe('33.33%');
    expect(formatBps(1)).toBe('0.01%');
  });

  it('formats chain timestamps in UTC', () => {
    expect(formatTimestamp(1_795_000_000n)).toBe('2026-11-18 11:06 UTC');
  });

  it('formats remaining time with the SDK duration format', () => {
    expect(formatRemaining(100n, 40n)).toEqual({ past: false, text: formatDuration(60) });
    expect(formatRemaining(40n, 100n)).toEqual({ past: true, text: formatDuration(60) });
    // A moment in the block just read has come: "0s ago", never "in 0s" (7B-P1).
    expect(formatRemaining(100n, 100n)).toEqual({ past: true, text: formatDuration(0) });
  });

  it('computes allowance coverage', () => {
    expect(coveragePercent(0n, 0n)).toBeNull();
    expect(coveragePercent(50n, 200n)).toBe(25);
    expect(coveragePercent(300n, 200n)).toBe(100);
    expect(coveragePercent(1n, 3n)).toBe(33);
  });

  it('moves chain time forward with the wall clock', () => {
    expect(chainNow(1000n, 5_000, 12_999)).toBe(1007n);
    expect(chainNow(1000n, 5_000, 4_000)).toBe(1000n);
  });
});
