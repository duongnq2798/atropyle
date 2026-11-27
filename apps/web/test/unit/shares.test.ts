import { describe, expect, it } from 'vitest';
import {
  boundaries,
  evenSplit,
  fromBoundaries,
  MIN_BPS,
  normalizeBoundaries,
  setShare,
  sharesOf,
  TOTAL_BPS,
  withShares,
} from '../../src/flows/shares';

/** A small deterministic generator: a failure replays with the same seed. */
function lcg(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s % n;
  };
}

function expectSplit(shares: readonly number[], n: number): void {
  expect(shares).toHaveLength(n);
  expect(shares.reduce((a, b) => a + b, 0)).toBe(TOTAL_BPS);
  for (const s of shares) {
    expect(s).toBeGreaterThanOrEqual(MIN_BPS);
    expect(s % 100).toBe(0);
  }
}

const rows = (percents: string[]) => percents.map((percent) => ({ account: '', percent }));

describe('shares', () => {
  it('splits evenly, the first heirs taking the leftover percent', () => {
    expect(evenSplit(1)).toEqual([10_000]);
    expect(evenSplit(3)).toEqual([3_400, 3_300, 3_300]);
    expect(evenSplit(5)).toEqual([2_000, 2_000, 2_000, 2_000, 2_000]);
    expect(boundaries([3_400, 3_300, 3_300])).toEqual([3_400, 6_700]);
    expect(fromBoundaries([3_400, 6_700])).toEqual([3_400, 3_300, 3_300]);
  });

  it('keeps the sum and the 1% floor under every edit', () => {
    const rand = lcg(7);
    for (let start = 1; start <= 5; start++) {
      let n = start;
      let shares = evenSplit(n);
      for (let round = 0; round < 400; round++) {
        const op = rand(5);
        if (op === 0 && n > 1) {
          // A drag: thumbs anywhere, crossing each other, past both ends, off the 1% grid.
          const b = Array.from({ length: n - 1 }, () => rand(11_001) - 500);
          shares = fromBoundaries(normalizeBoundaries(b));
        } else if (op === 1 && n > 1) {
          // Home on the first thumb, or End on the last one.
          const b = boundaries(shares);
          if (rand(2) === 0) b[0] = 0;
          else b[b.length - 1] = TOTAL_BPS;
          shares = fromBoundaries(normalizeBoundaries(b));
        } else if (op === 2) {
          shares = setShare(shares, rand(n), rand(12_000) - 1_000);
        } else if (op === 3 && n < 5) {
          n += 1;
          shares = evenSplit(n);
        } else if (op === 4 && n > 1) {
          n -= 1;
          shares = evenSplit(n);
        }
        expectSplit(shares, n);
      }
    }
    // The two edges a keyboard user reaches first.
    expect(fromBoundaries(normalizeBoundaries([0, 6_700]))).toEqual([100, 6_600, 3_300]);
    expect(fromBoundaries(normalizeBoundaries([3_400, 10_000]))).toEqual([3_400, 6_500, 100]);
    // The last heir's typed share is balanced by the one before.
    expect(setShare([5_000, 5_000], 1, 9_950)).toEqual([100, 9_900]);
  });

  it('reads the shares from the rows, or splits evenly when they are not a full split', () => {
    expect(sharesOf(rows(['']))).toEqual([10_000]);
    expect(sharesOf(rows(['33.33', '33.33', '33.34']))).toEqual([3_333, 3_333, 3_334]);
    expect(sharesOf(rows(['50', '', '']))).toEqual([3_400, 3_300, 3_300]);
    expect(sharesOf(rows(['70', '40']))).toEqual([5_000, 5_000]);
    expect(withShares(rows(['', '']), [6_000, 4_000]).map((r) => r.percent)).toEqual(['60', '40']);
    expect(withShares(rows(['50']), [10_000]).map((r) => r.percent)).toEqual(['']);
  });
});
