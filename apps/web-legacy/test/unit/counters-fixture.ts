import type { ChainCounters } from '@atropyle/sdk';

/** 2026-11-25 08:15:05 UTC. */
export const COUNTERS_TIME = 1_795_594_505n;

export function fixtureCounters(over: Partial<ChainCounters> = {}): ChainCounters {
  return {
    chainId: 196,
    factory: '0x1111111111111111111111111111111111111111',
    blockNumber: 76_825_469n,
    blockTimestamp: COUNTERS_TIME,
    team: ['0xC0a61674Fa1caAd04500073ea94Ec9006D7A2375', '0x990221559B7EB3516204dc73535d6581391cFAa4'],
    vaults: { all: 1234, outsideTeam: 1200 },
    paid: { all: 40, outsideTeam: 38 },
    releases: { all: 3, outsideTeam: 2 },
    stablecoins: { all: 12_345_678_900n, outsideTeam: 1_500_000n, decimals: 6 },
    read: 1234,
    complete: true,
    teamComplete: true,
    ...over,
  };
}
