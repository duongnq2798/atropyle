import type { ChainCounters } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { counterTiles, coverageOf, formatUsd } from '../../src/app/status/counters-view';

/** The fixture of the previous web app (its test/counters-fixture.ts on main 0909446). */
const C: ChainCounters = {
  chainId: 196,
  factory: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  blockNumber: 76_825_469n,
  blockTimestamp: 1_795_594_505n,
  team: [],
  vaults: { all: 1234, outsideTeam: 1200 },
  paid: { all: 40, outsideTeam: 38 },
  releases: { all: 3, outsideTeam: 2 },
  stablecoins: { all: 12_345_678_900n, outsideTeam: 1_500_000n, decimals: 6 },
  read: 1234,
  complete: true,
  teamComplete: true,
};

describe('chain counters', () => {
  it('shows five tiles, Drills as vaults minus paid, exact when every vault was read', () => {
    expect(counterTiles(C).map((x) => [x.id, x.all, x.outsideTeam, x.lowerBound, x.decimals])).toEqual([
      ['vaults', 1234n, 1200n, false, null],
      ['drills', 1194n, 1162n, false, null],
      ['paid', 40n, 38n, false, null],
      ['releases', 3n, 2n, false, null],
      ['stablecoins', 12_345_678_900n, 1_500_000n, false, 6],
    ]);
  });

  it('marks releases and stablecoins as lower bounds when not every vault was read, never vaults or paid', () => {
    const tiles = counterTiles({ ...C, complete: false, read: 200 });
    expect(tiles.filter((x) => x.lowerBound).map((x) => x.id)).toEqual(['releases', 'stablecoins']);
  });

  it('never shows a negative Drill count outside the team', () => {
    const odd = { ...C, vaults: { all: 5, outsideTeam: 1 }, paid: { all: 2, outsideTeam: 2 } };
    expect(counterTiles(odd)[1]).toMatchObject({ all: 3n, outsideTeam: 0n });
  });

  it('formats stablecoins in whole cents, rounded down, per language', () => {
    expect(formatUsd(12_345_678_900n, 6, 'en')).toBe('$12,345.67');
    expect(formatUsd(12_345_678_900n, 6, 'vi')).toBe('12.345,67 US$');
    expect(formatUsd(1_500_000n, 6, 'en')).toBe('$1.50');
    expect(formatUsd(0n, 6, 'en')).toBe('$0.00');
    expect(formatUsd(7n, 1, 'en')).toBe('$0.70');
  });

  it('says why a count is partial', () => {
    expect(coverageOf(C, 200)).toBe('complete');
    expect(coverageOf({ ...C, complete: false, read: 12 }, 200)).toBe('partial');
    expect(coverageOf({ ...C, complete: false, read: 200 }, 200)).toBe('cap');
  });
});
