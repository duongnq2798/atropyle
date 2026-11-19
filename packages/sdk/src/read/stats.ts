import type { AbiEvent, Address } from 'viem';
import { factoryAbi, vaultAbi } from '../abi/index';
import { sameAddress } from '../address';
import type { ReadContext } from './context';
import { parseStatsCursor } from './cursor';
import { getEventsChunked } from './events';

export interface StatsCursor {
  /** Last block included; pass the cursor back as `resume` to read only newer blocks. */
  toBlock: bigint;
  vaults: { vault: Address; owner: Address; drill: boolean }[];
  aliveEvents: number;
  alarms: number;
  releases: number;
  distributions: number;
}

export interface Stats {
  fromBlock: bigint;
  toBlock: bigint;
  vaults: { total: number; drill: number; paid: number };
  owners: number;
  /** Owner liveness signals: check-ins and every owner configuration change. */
  checkIns: number;
  alarms: number;
  releases: number;
  /** Transactions that moved at least one asset out of a vault. */
  distributions: number;
  cursor: StatsCursor;
}

const COUNTED = ['Alive', 'AlarmRaised', 'Released', 'Distributed'];
const EVENTS = [
  ...factoryAbi.filter((x) => x.type === 'event' && x.name === 'VaultCreated'),
  ...vaultAbi.filter((x) => x.type === 'event' && COUNTED.includes(x.name)),
] as AbiEvent[];

/**
 * Counts from events only, so anyone can reproduce the numbers (spec §14). One topic-filtered eth_getLogs per
 * range; a log counts only if the factory created its emitter, so look-alike events from other contracts are ignored.
 * Behind a load-balanced RPC the head comes from one node and a lagging node may clamp eth_getLogs to its own head, so a
 * cron should pass `toBlock = head - margin` (a few blocks): otherwise the persisted cursor can move past events that
 * were not served, and they are never counted.
 */
export async function readStats(
  ctx: ReadContext,
  o: {
    fromBlock?: bigint;
    toBlock?: bigint;
    resume?: StatsCursor;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<Stats> {
  const resume = o.resume === undefined ? undefined : parseStatsCursor(o.resume);
  const head = o.toBlock ?? (await ctx.client.getBlockNumber());
  // The cursor never moves back: a head behind it (a lagging node in a pool, an explicit older toBlock) would make the
  // next resume read the same blocks again and count their events twice.
  const toBlock = resume && head < resume.toBlock ? resume.toBlock : head;
  const start = resume ? resume.toBlock + 1n : (o.fromBlock ?? ctx.deployment.factoryBlock);
  const cur: StatsCursor = resume
    ? { ...resume, vaults: [...resume.vaults], toBlock }
    : { toBlock, vaults: [], aliveEvents: 0, alarms: 0, releases: 0, distributions: 0 };
  const known = new Set(cur.vaults.map((v) => v.vault.toLowerCase()));
  const distributed = new Set<string>();
  if (start <= toBlock) {
    const logs = await getEventsChunked(ctx, {
      abi: [...factoryAbi, ...vaultAbi],
      events: EVENTS,
      fromBlock: start,
      toBlock,
      onProgress: o.onProgress,
    });
    // Two passes: the factory initializes a clone (which emits Alive) before it emits VaultCreated,
    // so a vault's first event comes earlier in the same transaction than the event that makes it known.
    for (const e of logs) {
      if (e.name !== 'VaultCreated' || !sameAddress(e.address, ctx.deployment.factory)) continue;
      const vault = e.args.vault as Address;
      known.add(vault.toLowerCase());
      cur.vaults.push({ vault, owner: e.args.owner as Address, drill: e.args.drill === true });
    }
    for (const e of logs) {
      if (e.name === 'VaultCreated' || !known.has(e.address.toLowerCase())) continue;
      if (e.name === 'Alive') cur.aliveEvents++;
      else if (e.name === 'AlarmRaised') cur.alarms++;
      else if (e.name === 'Released') cur.releases++;
      else if (e.name === 'Distributed') distributed.add(`${e.address.toLowerCase()}:${e.transactionHash}`);
    }
  }
  cur.distributions += distributed.size;
  const drill = cur.vaults.filter((v) => v.drill).length;
  return {
    fromBlock: resume ? (o.fromBlock ?? ctx.deployment.factoryBlock) : start,
    toBlock,
    vaults: { total: cur.vaults.length, drill, paid: cur.vaults.length - drill },
    owners: new Set(cur.vaults.map((v) => v.owner.toLowerCase())).size,
    checkIns: Math.max(0, cur.aliveEvents - cur.vaults.length),
    alarms: cur.alarms,
    releases: cur.releases,
    distributions: cur.distributions,
    cursor: cur,
  };
}
