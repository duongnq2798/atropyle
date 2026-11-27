import type { AtropyleClient, VaultEvent } from '@atropyle/sdk';
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

/** The transfers that reached `reader`: sent, to that address in any letter case. */
export function receivedBy(rows: readonly TransferRow[], reader: Address): TransferRow[] {
  const me = reader.toLowerCase();
  return rows.filter((r) => r.ok && r.to.toLowerCase() === me);
}

/**
 * What the vault delivered to `reader` in the window of HISTORY_BLOCKS blocks ending at `toBlock`, never before
 * `floor` (the heir letter after a reload, spec §18.4.2 T11): the cost of one history window, read only once the
 * vault has passed to the reader and nothing is left to deliver to them.
 */
export async function deliveriesTo(
  atro: Pick<AtropyleClient, 'vault'>,
  vault: Address,
  reader: Address,
  toBlock: bigint,
  floor: bigint,
): Promise<TransferRow[]> {
  const fromBlock = historyFromBlock(toBlock, floor);
  return receivedBy(transferRows(await atro.vault(vault).events({ fromBlock, toBlock })), reader);
}
