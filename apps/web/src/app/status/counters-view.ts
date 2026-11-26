import type { ChainCounters } from '@atropyle/sdk';
import type { Lang } from '@/i18n/core';
import { formatCount } from '@/lib/count';

export type CounterId = 'vaults' | 'drills' | 'paid' | 'releases' | 'stablecoins';

export interface CounterTile {
  id: CounterId;
  all: bigint;
  outsideTeam: bigint;
  /** Counted over the vaults read only: the true number may be higher. */
  lowerBound: boolean;
  /** Stablecoin units of 10^-decimals; null for a count of vaults. */
  decimals: number | null;
}

export type Coverage = 'complete' | 'partial' | 'cap';

const big = (n: number) => BigInt(n);

/**
 * The five numbers of /status/ (ruling T10-R3): vaults and paid are exact (the factory's nonce and paidCount), Drills
 * are their difference, exact too; releases and stablecoins cover the vaults read.
 */
export function counterTiles(c: ChainCounters): CounterTile[] {
  const partial = !c.complete;
  const drillsOutside = c.vaults.outsideTeam - c.paid.outsideTeam;
  return [
    { id: 'vaults', all: big(c.vaults.all), outsideTeam: big(c.vaults.outsideTeam), lowerBound: false, decimals: null },
    {
      id: 'drills',
      all: big(c.vaults.all - c.paid.all),
      outsideTeam: big(Math.max(0, drillsOutside)),
      lowerBound: false,
      decimals: null,
    },
    { id: 'paid', all: big(c.paid.all), outsideTeam: big(c.paid.outsideTeam), lowerBound: false, decimals: null },
    {
      id: 'releases',
      all: big(c.releases.all),
      outsideTeam: big(c.releases.outsideTeam),
      lowerBound: partial,
      decimals: null,
    },
    {
      id: 'stablecoins',
      all: c.stablecoins.all,
      outsideTeam: c.stablecoins.outsideTeam,
      lowerBound: partial,
      decimals: c.stablecoins.decimals,
    },
  ];
}

/** Whole cents, rounded down, at face value: "$12,345.67" in English, "12.345,67 US$" in Vietnamese. */
export function formatUsd(raw: bigint, decimals: number, lang: Lang): string {
  const cents = decimals >= 2 ? raw / 10n ** BigInt(decimals - 2) : raw * 10n ** BigInt(2 - decimals);
  const whole = formatCount(cents / 100n, lang);
  const frac = String(cents % 100n).padStart(2, '0');
  return lang === 'vi' ? `${whole},${frac} US$` : `$${whole}.${frac}`;
}

/** Why releases and stablecoins may be low: nothing read beyond the team ('partial'), or the page's cap ('cap'). */
export function coverageOf(c: ChainCounters, maxVaults: number): Coverage {
  if (c.complete) return 'complete';
  return c.read >= maxVaults ? 'cap' : 'partial';
}

export function tileText(x: CounterTile, n: bigint, lang: Lang): string {
  return x.decimals === null ? formatCount(n, lang) : formatUsd(n, x.decimals, lang);
}
