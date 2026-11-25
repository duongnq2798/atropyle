import type { Address } from 'viem';
import { factoryAbi, vaultAbi } from '../abi/index';
import { toAddress } from '../address';
import { AtropyleError } from '../errors';
import { isReleasedState, stateName } from '../types';
import type { ReadContext } from './context';

export interface CountPair {
  all: number;
  /** Vaults whose owner is not a team address. */
  outsideTeam: number;
}

/**
 * Traction counters from view functions only: no eth_getLogs, whose 100-block cap on the public X Layer RPCs rules out
 * the whole history in a browser. The vault total is the factory's account nonce minus one: a contract's nonce starts
 * at 1 (EIP-161) and grows by one per contract it creates, and the factory creates nothing but vault clones, in
 * transactions that revert as a whole. Team vaults come from the factory index of each team address (initialize()
 * indexes the owner, and the owner never changes). Releases and stablecoins need each vault read, so they cover the
 * team index plus the `vaults` passed in; `complete` says whether that is every vault.
 */
export interface ChainCounters {
  chainId: number;
  factory: Address;
  /** Every number below is read at this block. */
  blockNumber: bigint;
  /** Unix time of that block, in seconds. */
  blockTimestamp: bigint;
  /** Owners counted as the team, checksummed. */
  team: Address[];
  /** Every vault the factory created: its account nonce minus one (exact). */
  vaults: CountPair;
  /** Vaults that paid the creation fee: factory.paidCount() (exact). */
  paid: CountPair;
  /** Vaults whose policy has released them (inheritance or recovery), Drills included, among the vaults read. */
  releases: CountPair;
  /**
   * Stablecoins live paid vaults could move right now (coverage: min(balance, allowance)), in the deployment's fee
   * tokens at face value, counted once per owner and token (the largest coverage: two vaults of one owner can cover
   * the same balance), among the vaults read. In units of 10^-decimals.
   */
  stablecoins: { all: bigint; outsideTeam: bigint; decimals: number };
  /** Vaults whose owner and state were read. */
  read: number;
  /** Every vault was read: releases and stablecoins are exact, not lower bounds. */
  complete: boolean;
  /**
   * The team's vault index was read to its end (at most 1000 entries per address, since anyone can grow it by naming
   * the address in free Drills): outsideTeam of vaults and paid is exact.
   */
  teamComplete: boolean;
}

export interface CountersOptions {
  /** Owners counted as the team. Default (client): getTeam(deployment). */
  team?: readonly string[];
  /**
   * More vault addresses to read, from any source (a scan cursor, a list kept elsewhere). Each one counts only if
   * factory.isVault says so at the block of the read.
   */
  vaults?: readonly string[];
  /** At most this many vaults are read, team index first (default 200). */
  maxVaults?: number;
  /** Read at this block instead of the latest. */
  blockNumber?: bigint;
}

/** Stablecoin amounts are reported with this many decimals (the fee tokens on X Layer all have 6). */
export const STABLECOIN_DECIMALS = 6;
const TEAM_INDEX_MAX = 1000n;
const PAGE = 100n;

/** `f` over `items`, 6 at a time, in order; after the first failure no worker starts another item. */
async function mapPool<T, R>(items: readonly T[], f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      out[i] = await f(items[i]).catch((e) => {
        failed = true;
        throw e;
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
  return out;
}

/** Checksummed addresses, each once, in order. */
const unique = (list: Address[]): Address[] => [...new Set(list)];

/** See ChainCounters. Every read is pinned to one block. */
export async function readCounters(ctx: ReadContext, o: CountersOptions = {}): Promise<ChainCounters> {
  const team = unique((o.team ?? []).map((a, i) => toAddress(a, `team[${i}]`)));
  const hints = unique((o.vaults ?? []).map((a, i) => toAddress(a, `vaults[${i}]`)));
  const maxVaults = o.maxVaults ?? 200;
  if (!Number.isSafeInteger(maxVaults) || maxVaults < 0) {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: `maxVaults must be a whole number, got ${String(o.maxVaults)}.`,
      details: { path: 'maxVaults' },
    });
  }
  const t0 = Date.now();
  const { client: c, deployment: d } = ctx;
  const block = await c.getBlock(o.blockNumber === undefined ? { blockTag: 'latest' } : { blockNumber: o.blockNumber });
  const blockNumber = block.number;
  const f = { address: d.factory, abi: factoryAbi, blockNumber } as const;

  const [paidCount, nonce, lengths] = await Promise.all([
    c.readContract({ ...f, functionName: 'paidCount' }),
    c.getTransactionCount({ address: d.factory, blockNumber }),
    Promise.all(team.map((a) => c.readContract({ ...f, functionName: 'vaultsOfLength', args: [a] }))),
  ]);
  let teamComplete = lengths.every((n) => n <= TEAM_INDEX_MAX);
  const pages: [Address, bigint, bigint][] = [];
  team.forEach((a, i) => {
    const n = lengths[i] < TEAM_INDEX_MAX ? lengths[i] : TEAM_INDEX_MAX;
    for (let start = 0n; start < n; start += PAGE) pages.push([a, start, n - start < PAGE ? n - start : PAGE]);
  });
  const indexed = unique(
    (await mapPool(pages, (args) => c.readContract({ ...f, functionName: 'vaultsOfPage', args }))).flat(),
  );
  // The index first: every team-owned vault is in it. A vault from `vaults` must also pass factory.isVault.
  if (indexed.length > maxVaults) teamComplete = false;
  const listed = new Set(indexed);
  const toRead = [...indexed, ...hints.filter((v) => !listed.has(v))].slice(0, maxVaults);

  const fee = new Set(d.feeTokens);
  const rows = (
    await mapPool(toRead, async (vault) => {
      // Asked first: an address that is not a vault has no owner() to call.
      if (!listed.has(vault) && !(await c.readContract({ ...f, functionName: 'isVault', args: [vault] }))) {
        return { real: false } as const;
      }
      const v = { address: vault, abi: vaultAbi, blockNumber } as const;
      const [owner, drill, code] = await Promise.all([
        c.readContract({ ...v, functionName: 'owner' }),
        c.readContract({ ...v, functionName: 'drill' }),
        c.readContract({ ...v, functionName: 'state' }),
      ]);
      const released = isReleasedState(stateName(code));
      const stable: [Address, bigint][] = [];
      if (!drill && !released) {
        const [assets, coverage] = await Promise.all([
          c.readContract({ ...v, functionName: 'assets' }),
          c.readContract({ ...v, functionName: 'coverage' }),
        ]);
        assets.forEach((a, i) => {
          if (a.kind === 0 && fee.has(a.token) && coverage[i] > 0n) stable.push([a.token, coverage[i]]);
        });
      }
      return { real: true, owner, drill, released, stable } as const;
    })
  ).filter((r) => r.real);

  const inTeam = new Set(team);
  const best = new Map<string, { token: Address; owner: Address; amount: bigint }>();
  for (const r of rows) {
    for (const [token, amount] of r.stable) {
      const key = `${r.owner}:${token}`;
      if (amount > (best.get(key)?.amount ?? 0n)) best.set(key, { token, owner: r.owner, amount });
    }
  }
  const stablecoins = { all: 0n, outsideTeam: 0n, decimals: STABLECOIN_DECIMALS };
  for (const b of best.values()) {
    const decimals = (await ctx.token(b.token, blockNumber)).decimals;
    if (decimals === null) continue;
    const shift = decimals - STABLECOIN_DECIMALS;
    const amount = shift >= 0 ? b.amount / 10n ** BigInt(shift) : b.amount * 10n ** BigInt(-shift);
    stablecoins.all += amount;
    if (!inTeam.has(b.owner)) stablecoins.outsideTeam += amount;
  }

  const teamRows = rows.filter((r) => inTeam.has(r.owner));
  const released = rows.filter((r) => r.released);
  // Never below what was read: a node that answers an older nonce must not produce a negative count.
  const vaultsAll = Math.max(nonce - 1, rows.length, Number(paidCount));
  const paidAll = Number(paidCount);
  ctx.log({ type: 'read', what: `counters ${rows.length} vault(s)`, ms: Date.now() - t0, blockNumber });
  return {
    chainId: d.chainId,
    factory: d.factory,
    blockNumber,
    blockTimestamp: block.timestamp,
    team,
    vaults: { all: vaultsAll, outsideTeam: vaultsAll - teamRows.length },
    paid: { all: paidAll, outsideTeam: Math.max(0, paidAll - teamRows.filter((r) => !r.drill).length) },
    releases: { all: released.length, outsideTeam: released.filter((r) => !inTeam.has(r.owner)).length },
    stablecoins,
    read: rows.length,
    complete: teamComplete && rows.length === vaultsAll,
    teamComplete,
  };
}
