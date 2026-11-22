import { describe, expect, it } from 'vitest';
import { loadStats, reviveCache, saveStats, statsKey, statsTiles, toCache } from '../../src/lib/stats-view';
import { memoryKV } from '../../src/lib/store';
import { fixtureStats } from './fixtures';

const FACTORY = '0xAbCdEf0000000000000000000000000000000001';

describe('stats cache', () => {
  it('statsKey lowercases the factory', () => {
    expect(statsKey(196, FACTORY)).toBe('atropyle:stats:v1:196:0xabcdef0000000000000000000000000000000001');
  });

  it('round-trips through localStorage, bigints included', () => {
    const kv = memoryKV();
    const saved = saveStats(kv, 196, FACTORY, fixtureStats(), 1_234);
    expect(saved).toEqual(toCache(fixtureStats(), 1_234));
    expect(loadStats(kv, 196, FACTORY.toLowerCase())).toEqual(saved);
    expect(loadStats(kv, 196, FACTORY)?.cursor.toBlock).toBe(2_000n);
    expect(loadStats(kv, 31337, FACTORY)).toBeNull();
  });

  it('rejects malformed entries and removes them', () => {
    const kv = memoryKV();
    const key = statsKey(196, FACTORY);
    const good = JSON.parse(
      JSON.stringify(toCache(fixtureStats(), 1), (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    );
    expect(reviveCache(good)).toEqual(toCache(fixtureStats(), 1));
    expect(reviveCache({ ...good, version: 2 })).toBeNull();
    expect(reviveCache({ ...good, stats: { ...good.stats, owners: -1 } })).toBeNull();
    expect(
      reviveCache({ ...good, cursor: { ...good.cursor, vaults: [{ vault: 'nope', owner: 'x', drill: true }] } }),
    ).toBeNull();
    kv.set(key, JSON.stringify({ ...good, version: 2 }));
    expect(loadStats(kv, 196, FACTORY)).toBeNull();
    expect(kv.get(key)).toBeNull();
  });

  it('drops a corrupt JSON entry', () => {
    const kv = memoryKV();
    kv.set(statsKey(196, FACTORY), '{');
    expect(loadStats(kv, 196, FACTORY)).toBeNull();
    expect(kv.get(statsKey(196, FACTORY))).toBeNull();
  });

  it('statsTiles lists the counters in a fixed order', () => {
    const { cursor: _cursor, ...snapshot } = fixtureStats();
    expect(statsTiles(snapshot)).toEqual([
      { id: 'vaults', value: 3 },
      { id: 'paid', value: 1 },
      { id: 'drill', value: 2 },
      { id: 'owners', value: 2 },
      { id: 'checkIns', value: 5 },
      { id: 'alarms', value: 1 },
      { id: 'releases', value: 0 },
      { id: 'distributions', value: 0 },
    ]);
  });
});
