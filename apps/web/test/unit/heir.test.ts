import type { VaultEvent } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { HISTORY_BLOCKS, historyFromBlock, transferRows } from '../../src/lib/heir';
import { PEOPLE } from './fixtures';

const H = `0x${'ab'.repeat(32)}` as const;
const ev = (name: string, args: Record<string, unknown>, logIndex: number): VaultEvent => ({
  address: PEOPLE.vault,
  name,
  args,
  blockNumber: 7n,
  logIndex,
  transactionHash: H,
});

describe('transferRows', () => {
  it('keeps Distributed and TransferFailed, in log order', () => {
    const rows = transferRows([
      ev('Released', { state: 3, target: PEOPLE.heirA }, 0),
      ev('Distributed', { assetIndex: 0n, to: PEOPLE.heirA.toLowerCase(), amountOrId: 700_000n }, 1),
      ev('TransferFailed', { assetIndex: 1n, to: PEOPLE.heirB }, 2),
    ]);
    expect(rows).toEqual([
      { assetIndex: 0, to: PEOPLE.heirA, ok: true, amount: 700_000n, hash: H, logIndex: 1 },
      { assetIndex: 1, to: PEOPLE.heirB, ok: false, amount: null, hash: H, logIndex: 2 },
    ]);
  });

  it('skips events with unexpected arguments', () => {
    expect(
      transferRows([
        ev('Distributed', { assetIndex: 'x', to: PEOPLE.heirA, amountOrId: 1n }, 0),
        ev('Distributed', { assetIndex: 0n, to: 'nope', amountOrId: 1n }, 1),
      ]),
    ).toEqual([]);
  });
});

describe('historyFromBlock', () => {
  it('reads a bounded window and never goes below block 0', () => {
    expect(HISTORY_BLOCKS).toBe(10_000n);
    expect(historyFromBlock(50_000n, 1n)).toBe(40_000n);
    expect(historyFromBlock(100n, 0n)).toBe(0n);
    expect(historyFromBlock(5_000n, 4_000n)).toBe(4_000n);
  });
});
