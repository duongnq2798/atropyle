import { type AtropyleClient, type PreparedTx, type TxPlan, vaultAbi } from '@atropyle/sdk';
import { encodeAbiParameters, encodeEventTopics, type Hex, type TransactionReceipt } from 'viem';
import { describe, expect, it } from 'vitest';
import { checkStep, readReceipt, settleBatch } from '../../src/tx/impl/calls';
import type { CallsResult } from '../../src/wallet/impl/send-calls';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const F = '0x1111111111111111111111111111111111111111';
const H = (n: number) => `0x${n.toString(16).padStart(2, '0').repeat(32)}` as Hex;

function step(): PreparedTx {
  return {
    chainId: 196,
    from: A,
    to: V,
    data: '0x183ff085',
    value: 0n,
    action: 'checkIn',
    summary: '',
    warnings: [],
    simulation: { ok: true, gas: 1n },
  };
}
const PLAN: TxPlan = { chainId: 196, from: A, vault: V, steps: [step(), step(), step()], summary: '', warnings: [] };

const STATE_CHANGED = {
  address: V,
  topics: encodeEventTopics({ abi: vaultAbi, eventName: 'StateChanged' }),
  data: encodeAbiParameters([{ type: 'uint8' }, { type: 'uint8' }], [1, 0]),
  blockNumber: 7n,
  blockHash: H(9),
  logIndex: 0,
  transactionIndex: 0,
  transactionHash: H(3),
  removed: false,
};

function receipt(hash: Hex, o: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    transactionHash: hash,
    from: A,
    to: V,
    status: 'success',
    blockNumber: 7n,
    gasUsed: 21_000n,
    logs: [],
    ...o,
  } as unknown as TransactionReceipt;
}

function atroWith(receipts: Record<string, TransactionReceipt>, blocks: Record<string, bigint> = {}): AtropyleClient {
  const get = async ({ hash }: { hash: Hex }) => {
    const r = receipts[hash];
    if (!r) throw new Error('receipt not found');
    return r;
  };
  return {
    deployment: { factory: F },
    publicClient: {
      waitForTransactionReceipt: get,
      getTransactionReceipt: get,
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => {
        const timestamp = blocks[blockNumber.toString()];
        if (timestamp === undefined) throw new Error('no block');
        return { timestamp };
      },
    },
  } as unknown as AtropyleClient;
}

const calls = (status: CallsResult['status'], hashes: Hex[]): CallsResult => ({
  id: 'b1',
  status,
  hashes,
  ok: status === 'confirmed',
});
const all = { [H(1)]: receipt(H(1)), [H(2)]: receipt(H(2)), [H(3)]: receipt(H(3), { logs: [STATE_CHANGED] as never }) };

describe('settleBatch', () => {
  it("confirms a bundle from the app's own receipts, one per call, with their events", async () => {
    const s = await settleBatch(atroWith(all), PLAN, calls('confirmed', [H(1), H(2), H(3)]));
    if (s.kind !== 'confirmed') throw new Error(s.kind);
    expect(s.result.steps.map((x) => [x.index, x.hash])).toEqual([
      [0, H(1)],
      [1, H(2)],
      [2, H(3)],
    ]);
    expect(s.result.steps[2].events[0]).toMatchObject({ name: 'StateChanged', args: { from: 1, to: 0 } });
  });

  it('one transaction for the whole bundle (a smart account) carries the events on the last step', async () => {
    const one = receipt(H(4), { to: A, logs: [{ ...STATE_CHANGED, transactionHash: H(4) }] as never });
    const s = await settleBatch(atroWith({ [H(4)]: one }), PLAN, calls('confirmed', [H(4)]));
    if (s.kind !== 'confirmed') throw new Error(s.kind);
    expect(s.result.steps.map((x) => x.hash)).toEqual([H(4), H(4), H(4)]);
    expect(s.result.steps.map((x) => x.events.length)).toEqual([0, 0, 1]);
  });

  it('is stuck while the wallet has not said, or says partial or something unknown', async () => {
    for (const status of ['pending', 'partial', 'unknown'] as const) {
      expect((await settleBatch(atroWith(all), PLAN, calls(status, [H(1)]))).kind).toBe('stuck');
    }
  });

  it("is stuck with more hashes than steps, a receipt it cannot read, or one that is not the plan's call", async () => {
    const four = calls('confirmed', [H(1), H(2), H(3), H(5)]);
    expect((await settleBatch(atroWith(all), PLAN, four)).kind).toBe('stuck');
    const missing = calls('confirmed', [H(1), H(2), H(6)]);
    expect((await settleBatch(atroWith(all, {}), PLAN, missing, { timeoutMs: 1 })).kind).toBe('stuck');
    const foreign = { ...all, [H(2)]: receipt(H(2), { from: V }) };
    expect((await settleBatch(atroWith(foreign), PLAN, calls('confirmed', [H(1), H(2), H(3)]))).kind).toBe('stuck');
  });

  it('a revert with nothing after it fails there; the next send starts at that step', async () => {
    const r = { [H(1)]: receipt(H(1)), [H(2)]: receipt(H(2), { status: 'reverted' }) };
    const s = await settleBatch(atroWith(r), PLAN, calls('reverted', [H(1), H(2)]));
    expect(s).toMatchObject({ kind: 'failed', confirmed: 1, hashes: [H(1)], failedHash: H(2) });
    if (s.kind === 'failed') expect(s.error.details).toMatchObject({ index: 1, completed: 1, hash: H(2) });
  });

  it('is stuck when a call after a reverted one went through', async () => {
    const r = { ...all, [H(2)]: receipt(H(2), { status: 'reverted' }) };
    expect((await settleBatch(atroWith(r), PLAN, calls('reverted', [H(1), H(2), H(3)]))).kind).toBe('stuck');
  });

  it('a 400 with no transaction failed before the chain; a wallet that stopped early leaves the rest to send', async () => {
    expect(await settleBatch(atroWith({}), PLAN, calls('failed', []))).toMatchObject({ kind: 'failed', confirmed: 0 });
    expect(await settleBatch(atroWith(all), PLAN, calls('reverted', [H(1)]))).toMatchObject({
      kind: 'failed',
      confirmed: 1,
      failedHash: null,
    });
    expect((await settleBatch(atroWith(all), PLAN, calls('confirmed', [H(1)]))).kind).toBe('stuck');
  });
});

describe('checkStep', () => {
  it('confirmed, reverted, or not known yet', async () => {
    expect(await checkStep(atroWith(all), PLAN, 0, H(1))).toMatchObject({ kind: 'confirmed', step: { index: 0 } });
    const reverted = { [H(1)]: receipt(H(1), { status: 'reverted' }) };
    expect((await checkStep(atroWith(reverted), PLAN, 0, H(1))).kind).toBe('reverted');
    expect((await checkStep(atroWith({}), PLAN, 0, H(1))).kind).toBe('unknown');
    const elsewhere = { [H(1)]: receipt(H(1), { to: F }) };
    expect((await checkStep(atroWith(elsewhere), PLAN, 0, H(1))).kind).toBe('unknown');
  });
});

describe('readReceipt', () => {
  it('fills the block of an earlier step and every block time; a read that fails leaves the field empty', async () => {
    const steps = [
      { index: 0, action: 'checkIn' as const, hash: H(1), blockNumber: null, time: null, events: [] },
      { index: 1, action: 'checkIn' as const, hash: H(7), blockNumber: 8n, time: null, events: [] },
    ];
    const out = await readReceipt(atroWith(all, { '7': 1_800_000_000n }), PLAN, steps);
    expect(out.map((s) => [s.blockNumber, s.time])).toEqual([
      [7n, 1_800_000_000n],
      [8n, null],
    ]);
  });
});
