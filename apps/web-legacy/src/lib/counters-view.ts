import type { ChainCounters, Deployment } from '@atropyle/sdk';
import { formatAmount } from './format';
import { loadStats } from './stats-view';
import type { KV } from './store';

export type CounterId = 'vaults' | 'paid' | 'releases' | 'stablecoins';

export interface CounterTile {
  id: CounterId;
  /** Display text of the count over every owner, and outside the team. */
  all: string;
  outsideTeam: string;
  /** Raw values for tests and data attributes. */
  rawAll: string;
  rawOutsideTeam: string;
  /** Counted over the vaults read only: the true number may be higher. */
  lowerBound: boolean;
}

const count = (n: number) => formatAmount(BigInt(n), null);

/** Whole cents, truncated, with a dollar sign: the fee stablecoins counted at face value. */
export function formatUsd(raw: bigint, decimals: number): string {
  const cents = decimals >= 2 ? raw / 10n ** BigInt(decimals - 2) : raw * 10n ** BigInt(2 - decimals);
  return `$${formatAmount(cents / 100n, null)}.${String(cents % 100n).padStart(2, '0')}`;
}

export function counterTiles(c: ChainCounters): CounterTile[] {
  const pair = (id: CounterId, all: number, outside: number, lowerBound: boolean): CounterTile => ({
    id,
    all: count(all),
    outsideTeam: count(outside),
    rawAll: String(all),
    rawOutsideTeam: String(outside),
    lowerBound,
  });
  const s = c.stablecoins;
  return [
    pair('vaults', c.vaults.all, c.vaults.outsideTeam, false),
    pair('paid', c.paid.all, c.paid.outsideTeam, false),
    pair('releases', c.releases.all, c.releases.outsideTeam, !c.complete),
    {
      id: 'stablecoins',
      all: formatUsd(s.all, s.decimals),
      outsideTeam: formatUsd(s.outsideTeam, s.decimals),
      rawAll: s.all.toString(),
      rawOutsideTeam: s.outsideTeam.toString(),
      lowerBound: !c.complete,
    },
  ];
}

/**
 * Vaults this device already knows from a full event count (on the status page), so the counters can read them
 * too and report exact releases. The SDK checks each one with factory.isVault.
 */
export function knownVaults(kv: KV, d: Pick<Deployment, 'chainId' | 'factory'>): string[] {
  return loadStats(kv, d.chainId, d.factory)?.cursor.vaults.map((v) => v.vault) ?? [];
}
