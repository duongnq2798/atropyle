import type { VaultEvent } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { deliveriesTo, HISTORY_BLOCKS, historyFromBlock, receivedBy, transferRows } from '../../src/flows/impl/heir';
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

describe('what reached a reader', () => {
  const events = [
    ev('Distributed', { assetIndex: 0n, to: PEOPLE.heirA, amountOrId: 700_000n }, 1),
    ev('Distributed', { assetIndex: 0n, to: PEOPLE.heirB, amountOrId: 300_000n }, 2),
    ev('TransferFailed', { assetIndex: 1n, to: PEOPLE.heirA }, 3),
  ];

  it('keeps only the transfers that reached the reader, in any letter case', () => {
    const rows = receivedBy(transferRows(events), PEOPLE.heirA.toLowerCase() as typeof PEOPLE.heirA);
    expect(rows.map((r) => [r.to, r.amount])).toEqual([[PEOPLE.heirA, 700_000n]]);
  });

  it('reads one window of the vault events, ending at the block it is given', async () => {
    const asked: unknown[] = [];
    const atro = {
      vault: (v: string) => ({
        events: async (range: unknown) => {
          asked.push([v, range]);
          return events;
        },
      }),
    };
    const rows = await deliveriesTo(atro as never, PEOPLE.vault, PEOPLE.heirB, 50_000n, 1n);
    expect(asked).toEqual([[PEOPLE.vault, { fromBlock: 40_000n, toBlock: 50_000n }]]);
    expect(rows.map((r) => [r.to, r.amount])).toEqual([[PEOPLE.heirB, 300_000n]]);
  });
});
