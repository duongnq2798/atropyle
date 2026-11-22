import { type AtropyleClient, modelEngine, timelineOf } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { createSdkChain } from '../../src/chain/sdk';
import { snapshotFixture, T0, VAULT, VAULT2 } from '../helpers/fixtures';

const snap = snapshotFixture();

/** Just enough of an AtropyleClient for the adapter: no RPC, no key. */
function stubAtropyle(): AtropyleClient {
  const stub = {
    deployment: { factoryBlock: 100n },
    publicClient: {
      getBlock: async (o?: { blockNumber?: bigint }) =>
        o?.blockNumber === undefined
          ? { number: 200n, timestamp: T0 }
          : { number: o.blockNumber, timestamp: 1000n + o.blockNumber },
    },
    engineFor: async () => modelEngine(),
    vault: (a: string) => ({
      snapshot: async () => snap,
      registered: async () => a === VAULT,
    }),
    scan: async (o: { resume: { toBlock: bigint; vaults: string[] }; toBlock: bigint }) => ({
      fromBlock: o.resume.toBlock + 1n,
      toBlock: o.toBlock,
      created: [],
      events: [],
      cursor: { toBlock: o.toBlock, vaults: o.resume.vaults },
      truncated: false,
    }),
    integrity: async () => ({ ok: true }),
  };
  return stub as unknown as AtropyleClient;
}

describe('createSdkChain', () => {
  const chain = createSdkChain(stubAtropyle(), { wallet: null });

  it('reads the head, block times and the factory block', async () => {
    expect(chain.factoryBlock).toBe(100n);
    expect(await chain.head()).toEqual({ number: 200n, timestamp: T0 });
    expect(await chain.blockTime(150n)).toBe(1150n);
  });

  it('builds a view from the snapshot and the timeline of the vault engine', async () => {
    const v = await chain.view(VAULT);
    expect(v.nextCheckAt).toBe(timelineOf(modelEngine(), snap).nextCheckAt);
    expect(v.nextCheckAt).toBe(T0 + 120n);
  });

  it('asks the factory whether an address is a vault', async () => {
    expect(await chain.isVault(VAULT)).toBe(true);
    expect(await chain.isVault(VAULT2)).toBe(false);
  });

  it('passes the cursor to scan', async () => {
    const r = await chain.scan({ resume: { toBlock: 120n, vaults: [VAULT] }, toBlock: 140n });
    expect(r).toMatchObject({ fromBlock: 121n, toBlock: 140n, cursor: { toBlock: 140n, vaults: [VAULT] } });
  });

  it('runs the SDK keeper dry without a wallet', async () => {
    const r = await chain.keeper({ vaults: [], maxTx: 20, lastDistributeAt: new Map() });
    expect(r).toMatchObject({ ranAt: T0, dryRun: true, keeper: null, sent: 0, outcomes: [] });
  });
});
