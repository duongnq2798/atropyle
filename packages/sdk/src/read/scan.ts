import type { AbiEvent, Address, Hex } from 'viem';
import { factoryAbi, vaultAbi } from '../abi/index';
import { sameAddress } from '../address';
import { AtropyleError } from '../errors';
import type { ReadContext } from './context';
import { getEventsChunked, type VaultEvent } from './events';

export interface ScanCursor {
  /** Last block included. */
  toBlock: bigint;
  /** Every vault the factory has created up to toBlock. */
  vaults: Address[];
}

export interface CreatedVault {
  vault: Address;
  owner: Address;
  drill: boolean;
  blockNumber: bigint;
  transactionHash: Hex;
}

export interface ScanResult {
  fromBlock: bigint;
  toBlock: bigint;
  /** Vaults the factory created in this range. */
  created: CreatedVault[];
  /** Events emitted by factory-created vaults in this range, in log order. */
  events: VaultEvent[];
  /** Pass back as `resume` to continue after toBlock. */
  cursor: ScanCursor;
  /** maxBlocks stopped the scan before the chain head. */
  truncated: boolean;
}

export interface ScanOptions {
  fromBlock?: bigint;
  toBlock?: bigint;
  resume?: ScanCursor;
  /** At most this many blocks in one run (a whole number from 1), so a cron catches up in steps after an outage. */
  maxBlocks?: number;
  onProgress?: (done: number, total: number) => void;
}

const EVENTS = [
  ...factoryAbi.filter((x) => x.type === 'event' && x.name === 'VaultCreated'),
  ...vaultAbi.filter((x) => x.type === 'event'),
] as AbiEvent[];

/** Every Atropyle event since a cursor, with one topic-filtered eth_getLogs per block range (spec §9.5). */
export async function scanEvents(ctx: ReadContext, o: ScanOptions = {}): Promise<ScanResult> {
  if (o.maxBlocks !== undefined && !(Number.isSafeInteger(o.maxBlocks) && o.maxBlocks >= 1)) {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: `maxBlocks must be a whole number of at least 1, got ${String(o.maxBlocks)}.`,
      details: { path: 'maxBlocks' },
    });
  }
  const head = o.toBlock ?? (await ctx.client.getBlockNumber());
  const fromBlock = o.resume ? o.resume.toBlock + 1n : (o.fromBlock ?? ctx.deployment.factoryBlock);
  const capped = o.maxBlocks === undefined ? head : fromBlock + BigInt(o.maxBlocks) - 1n;
  const toBlock = capped < head ? capped : head;
  const vaults = [...(o.resume?.vaults ?? [])];
  const known = new Set(vaults.map((v) => v.toLowerCase()));
  const created: CreatedVault[] = [];
  const events: VaultEvent[] = [];
  if (fromBlock > toBlock) {
    // Nothing new (a lagging node, or a cursor already at the head): the cursor stays where it was.
    const cursor = { toBlock: fromBlock - 1n, vaults };
    return { fromBlock, toBlock: cursor.toBlock, created, events, cursor, truncated: false };
  }
  const logs = await getEventsChunked(ctx, {
    abi: [...factoryAbi, ...vaultAbi],
    events: EVENTS,
    fromBlock,
    toBlock,
    onProgress: o.onProgress,
  });
  // Two passes: initialize() emits the vault's first Alive before the factory emits VaultCreated.
  for (const e of logs) {
    if (e.name !== 'VaultCreated' || !sameAddress(e.address, ctx.deployment.factory)) continue;
    const vault = e.args.vault as Address;
    known.add(vault.toLowerCase());
    vaults.push(vault);
    created.push({
      vault,
      owner: e.args.owner as Address,
      drill: e.args.drill === true,
      blockNumber: e.blockNumber,
      transactionHash: e.transactionHash,
    });
  }
  for (const e of logs) {
    if (e.name !== 'VaultCreated' && known.has(e.address.toLowerCase())) events.push(e);
  }
  return { fromBlock, toBlock, created, events, cursor: { toBlock, vaults }, truncated: toBlock < head };
}
