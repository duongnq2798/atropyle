import { describe, expect, it } from 'vitest';
import { counterTiles, formatUsd, knownVaults } from '../../src/lib/counters-view';
import { saveStats } from '../../src/lib/stats-view';
import { memoryKV } from '../../src/lib/store';
import { fixtureCounters } from './counters-fixture';
import { fixtureDeployment, fixtureStats } from './fixtures';

describe('counterTiles', () => {
  it('shows each count over every owner and outside the team, grouped', () => {
    expect(counterTiles(fixtureCounters())).toEqual([
      { id: 'vaults', all: '1,234', outsideTeam: '1,200', rawAll: '1234', rawOutsideTeam: '1200', lowerBound: false },
      { id: 'paid', all: '40', outsideTeam: '38', rawAll: '40', rawOutsideTeam: '38', lowerBound: false },
      { id: 'releases', all: '3', outsideTeam: '2', rawAll: '3', rawOutsideTeam: '2', lowerBound: false },
      {
        id: 'stablecoins',
        all: '$12,345.67',
        outsideTeam: '$1.50',
        rawAll: '12345678900',
        rawOutsideTeam: '1500000',
        lowerBound: false,
      },
    ]);
  });

  it('marks only the counts that need every vault as lower bounds when some were not read', () => {
    const tiles = counterTiles(fixtureCounters({ complete: false, read: 10 }));
    expect(tiles.map((t) => [t.id, t.lowerBound])).toEqual([
      ['vaults', false],
      ['paid', false],
      ['releases', true],
      ['stablecoins', true],
    ]);
  });
});

describe('formatUsd', () => {
  it('truncates to whole cents whatever the decimals', () => {
    expect(formatUsd(0n, 6)).toBe('$0.00');
    expect(formatUsd(1_999_999n, 6)).toBe('$1.99');
    expect(formatUsd(10n ** 18n * 1_000_000n, 18)).toBe('$1,000,000.00');
    expect(formatUsd(5n, 0)).toBe('$5.00');
  });
});

describe('knownVaults', () => {
  it('lists the vaults of the cached full count for this chain and factory, or none', () => {
    const d = fixtureDeployment();
    const kv = memoryKV();
    expect(knownVaults(kv, d)).toEqual([]);
    saveStats(kv, d.chainId, d.factory, fixtureStats(), 1_000);
    expect(knownVaults(kv, d)).toEqual(fixtureStats().cursor.vaults.map((v) => v.vault));
    expect(knownVaults(kv, { ...d, chainId: 31337 })).toEqual([]);
  });
});
