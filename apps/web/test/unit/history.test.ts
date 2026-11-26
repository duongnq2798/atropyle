import type { VaultEvent } from '@atropyle/sdk';
import type { Hex } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { HISTORY_BLOCKS } from '../../src/flows/impl/heir';
import { HISTORY_TIMES, historyTxs, historyWindow, movedBetween } from '../../src/flows/impl/history';
import { PEOPLE } from './fixtures';

const ZERO = '0x0000000000000000000000000000000000000000';
const hashOf = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;
const ev = (
  name: string,
  args: Record<string, unknown>,
  blockNumber: bigint,
  logIndex: number,
  hash: Hex,
): VaultEvent => ({
  address: PEOPLE.vault,
  name,
  args,
  blockNumber,
  logIndex,
  transactionHash: hash,
});

describe('vault history', () => {
  it('makes one entry per transaction, newest first, and keeps what the circuit decided', () => {
    const txs = historyTxs([
      ev('Alive', { at: 1_000n }, 10n, 0, hashOf(1)),
      ev('ConfigUpdated', { what: 2 }, 11n, 0, hashOf(2)),
      // A poke: the alarm and the circuit's decision, in one transaction.
      ev('AlarmRaised', { state: 1, target: ZERO }, 12n, 0, hashOf(3)),
      ev('StateChanged', { from: 0, to: 1 }, 12n, 1, hashOf(3)),
      ev('RecoveryVoted', { guardian: PEOPLE.g1, target: PEOPLE.heirB }, 13n, 0, hashOf(4)),
      ev('RecoveryVoted', { guardian: PEOPLE.g2, target: ZERO }, 13n, 1, hashOf(5)),
      ev('Released', { state: 5, target: ZERO }, 14n, 0, hashOf(6)),
      ev('StateChanged', { from: 1, to: 5 }, 14n, 1, hashOf(6)),
      ev('Distributed', { assetIndex: 0n, to: PEOPLE.heirA, amountOrId: 5n }, 15n, 0, hashOf(7)),
      ev('TransferFailed', { assetIndex: 1n, to: PEOPLE.heirB, amountOrId: 0n }, 15n, 1, hashOf(7)),
      ev('Distributed', { assetIndex: 2n, to: PEOPLE.heirA, amountOrId: 1n }, 15n, 2, hashOf(7)),
      ev('Unknown', {}, 16n, 0, hashOf(8)),
    ]);
    // The transaction with only an unknown event is left out.
    expect(txs.map((x) => x.hash)).toEqual([7, 6, 5, 4, 3, 2, 1].map(hashOf));
    expect(txs[0]).toMatchObject({ rows: [{ kind: 'transfers', sent: 2, failed: 1 }], decided: [], at: null });
    expect(txs[1]).toMatchObject({
      rows: [{ kind: 'release', state: 'releasedInherit', target: null }],
      decided: [{ from: 'grace', to: 'releasedInherit' }],
    });
    expect(txs[2].rows).toEqual([{ logIndex: 1, kind: 'vote', guardian: PEOPLE.g2, target: null }]);
    expect(txs[3].rows).toEqual([{ logIndex: 0, kind: 'vote', guardian: PEOPLE.g1, target: PEOPLE.heirB }]);
    expect(txs[4]).toMatchObject({
      rows: [{ kind: 'alarm', state: 'grace', target: null }],
      decided: [{ from: 'active', to: 'grace' }],
    });
    expect(txs[5].rows).toEqual([{ logIndex: 0, kind: 'config', part: 'guardians' }]);
    // Alive carries its own time: no block read is needed for it.
    expect(txs[6]).toMatchObject({ rows: [{ kind: 'checkIn' }], at: 1_000n });
  });

  it('keeps a transaction whose only known event is the circuit deciding', () => {
    const [tx] = historyTxs([ev('StateChanged', { from: 1, to: 0 }, 20n, 3, hashOf(9))]);
    expect(tx).toMatchObject({ rows: [], decided: [{ from: 'grace', to: 'active' }], logIndex: 3 });
  });

  it('reads one window, at most HISTORY_TIMES block times, and stops at the floor', async () => {
    const events = vi.fn(async (_range: { fromBlock: bigint; toBlock: bigint }) =>
      Array.from({ length: HISTORY_TIMES + 5 }, (_, i) =>
        ev('ConfigUpdated', { what: 1 }, 20_000n + BigInt(i), 0, hashOf(i + 1)),
      ),
    );
    const getBlock = vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: blockNumber * 2n }));
    const atro = { vault: () => ({ events }), publicClient: { getBlock, getBlockNumber: async () => 25_000n } };

    const first = await historyWindow(atro as never, PEOPLE.vault, null, 100n);
    expect(events).toHaveBeenCalledWith({ fromBlock: 25_000n - HISTORY_BLOCKS, toBlock: 25_000n });
    expect(first).toMatchObject({ fromBlock: 15_000n, toBlock: 25_000n, more: true });
    expect(getBlock).toHaveBeenCalledTimes(HISTORY_TIMES);
    expect(first.txs.filter((x) => x.at !== null)).toHaveLength(HISTORY_TIMES);
    expect(first.txs[0]).toMatchObject({ blockNumber: 20_044n, at: 40_088n });
    expect(first.txs.at(-1)).toMatchObject({ blockNumber: 20_000n, at: null });

    const last = await historyWindow(atro as never, PEOPLE.vault, first.fromBlock - 1n, 10_000n);
    expect(events).toHaveBeenLastCalledWith({ fromBlock: 10_000n, toBlock: 14_999n });
    expect(last.more).toBe(false);
  });

  it('finds the last change of state between two reads, in the blocks after the first read', async () => {
    const events = vi.fn(async (_range: { fromBlock: bigint; toBlock: bigint }) => [
      // Out of order on purpose: the newest decision wins, by block then log index.
      ev('StateChanged', { from: 1, to: 5 }, 105n, 1, hashOf(2)),
      ev('AlarmRaised', { state: 1, target: ZERO }, 103n, 0, hashOf(1)),
      ev('StateChanged', { from: 0, to: 1 }, 103n, 1, hashOf(1)),
      ev('Released', { state: 5, target: ZERO }, 105n, 0, hashOf(2)),
    ]);
    const atro = { vault: () => ({ events }) };
    expect(await movedBetween(atro as never, PEOPLE.vault, 100n, 110n)).toEqual({ to: 'releasedInherit', block: 105n });
    expect(events).toHaveBeenCalledWith({ fromBlock: 101n, toBlock: 110n });

    events.mockResolvedValueOnce([ev('Alive', { at: 1n }, 104n, 0, hashOf(3))]);
    expect(await movedBetween(atro as never, PEOPLE.vault, 100n, 110n)).toBeNull();
    // No newer block: no read at all.
    events.mockClear();
    expect(await movedBetween(atro as never, PEOPLE.vault, 110n, 110n)).toBeNull();
    expect(events).not.toHaveBeenCalled();
  });
});
