import type { VaultEvent } from '@atropyle/sdk';
import { type Address, getAddress, type Hex, isAddress } from 'viem';

export interface TransferRow {
  assetIndex: number;
  to: Address;
  ok: boolean;
  /** Amount for ERC-20 and ERC-1155, token id for ERC-721; null for a failed transfer. */
  amount: bigint | null;
  hash: Hex;
  logIndex: number;
}

/** About 3 hours of X Layer blocks. The SDK default (a day) is 864 eth_getLogs calls on a 100-block public node. */
export const HISTORY_BLOCKS = 10_000n;

/** Never before the factory existed, as the SDK default does. */
export function historyFromBlock(blockNumber: bigint, factoryBlock: bigint): bigint {
  const from = blockNumber > HISTORY_BLOCKS ? blockNumber - HISTORY_BLOCKS : 0n;
  return from > factoryBlock ? from : factoryBlock;
}

/** One row per transfer the vault attempted: events Distributed and TransferFailed (Plan 1), in log order. */
export function transferRows(events: readonly VaultEvent[]): TransferRow[] {
  const rows: TransferRow[] = [];
  for (const e of events) {
    if (e.name !== 'Distributed' && e.name !== 'TransferFailed') continue;
    const { assetIndex, to, amountOrId } = e.args;
    if (typeof assetIndex !== 'bigint' || typeof to !== 'string' || !isAddress(to, { strict: false })) continue;
    const ok = e.name === 'Distributed';
    rows.push({
      assetIndex: Number(assetIndex),
      to: getAddress(to),
      ok,
      amount: ok && typeof amountOrId === 'bigint' ? amountOrId : null,
      hash: e.transactionHash,
      logIndex: e.logIndex,
    });
  }
  return rows;
}
