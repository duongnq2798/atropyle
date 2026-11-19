import { type Abi, type AbiEvent, type Address, type Hex, type Log, parseEventLogs } from 'viem';
import { vaultAbi } from '../abi/index';
import type { ReadContext } from './context';

export interface VaultEvent {
  address: Address;
  name: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
}

/** About one day of X Layer blocks (one block per second). */
export const DEFAULT_EVENTS_WINDOW = 86_400n;
const CONCURRENCY = 8;

export function decodeLogs(abi: Abi, logs: Log[], eventName?: string): VaultEvent[] {
  const out: VaultEvent[] = [];
  for (const l of parseEventLogs({ abi, logs, strict: true })) {
    if (eventName && l.eventName !== eventName) continue;
    out.push({
      address: l.address,
      name: l.eventName,
      args: l.args as Record<string, unknown>,
      blockNumber: l.blockNumber,
      logIndex: l.logIndex,
      transactionHash: l.transactionHash,
    });
  }
  return out;
}

/** Inclusive ranges with at most `size` blocks each (to - from <= size - 1). */
export function blockRanges(from: bigint, to: bigint, size: number): [bigint, bigint][] {
  const n = BigInt(size);
  const out: [bigint, bigint][] = [];
  for (let start = from; start <= to; start += n) out.push([start, start + n - 1n < to ? start + n - 1n : to]);
  return out;
}

/**
 * eth_getLogs split into deployment.logsBlockRange blocks (100 on the public X Layer RPCs, measured 18/11),
 * up to 8 ranges in flight, results in block order (spec §16.4). Without `address`, `events` filters by topic.
 */
export async function getEventsChunked(
  ctx: ReadContext,
  p: {
    address?: Address | Address[];
    abi: Abi;
    events?: readonly AbiEvent[];
    eventName?: string;
    fromBlock: bigint;
    toBlock: bigint;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<VaultEvent[]> {
  const ranges = blockRanges(p.fromBlock, p.toBlock, ctx.deployment.logsBlockRange);
  const results: VaultEvent[][] = new Array(ranges.length);
  let next = 0;
  let done = 0;
  // After the first failure no worker takes another range or reports progress: Promise.all below has already
  // rejected, and a caller that retries would otherwise run alongside the leftovers, past the cap of 8 in flight.
  let failed = false;
  const t0 = Date.now();
  async function worker() {
    while (!failed && next < ranges.length) {
      const i = next++;
      const [fromBlock, toBlock] = ranges[i];
      try {
        const logs = p.events
          ? await ctx.client.getLogs({ address: p.address, events: p.events, fromBlock, toBlock })
          : await ctx.client.getLogs({ address: p.address, fromBlock, toBlock });
        if (failed) return;
        results[i] = decodeLogs(p.abi, logs as Log[], p.eventName);
        p.onProgress?.(++done, ranges.length);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ranges.length) }, worker));
  ctx.log({ type: 'read', what: `getLogs ${ranges.length} range(s)`, ms: Date.now() - t0, blockNumber: p.toBlock });
  return results.flat();
}

export async function readEvents(
  ctx: ReadContext,
  vault: Address,
  o: { fromBlock?: bigint; toBlock?: bigint } = {},
): Promise<VaultEvent[]> {
  const toBlock = o.toBlock ?? (await ctx.client.getBlockNumber());
  const recent = toBlock - DEFAULT_EVENTS_WINDOW;
  const fromBlock = o.fromBlock ?? (recent > ctx.deployment.factoryBlock ? recent : ctx.deployment.factoryBlock);
  return getEventsChunked(ctx, { address: vault, abi: vaultAbi, fromBlock, toBlock });
}
