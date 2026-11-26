// @vitest-environment node
import { AtropyleError, factoryAbi, type VaultRef, vaultAbi } from '@atropyle/sdk';
import { HttpRequestError } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { failedEmpty } from '../../src/chain/hooks';
import { ME_LIMIT, myVaults } from '../../src/chain/impl/my-vaults';
import type { Sdk } from '../../src/chain/types';
import { failedFirst } from '../../src/chain/use-my-vaults';
import { PEOPLE } from './fixtures';

const FACTORY = '0x1111111111111111111111111111111111111111';
const DRILL = '0x2222222222222222222222222222222222222222';
const REAL = '0x3333333333333333333333333333333333333333';
const ref = (vault: `0x${string}`, drill: boolean): VaultRef => ({
  vault,
  owner: PEOPLE.owner,
  drill,
  state: 'active',
  roles: ['owner'],
});

interface Read {
  address: string;
  abi: unknown;
  functionName: string;
  args?: readonly unknown[];
  blockNumber?: bigint;
}

function fakeSdk(
  refs: VaultRef[],
  o: { length?: bigint; ends?: Record<string, bigint>; now?: bigint; fail?: unknown } = {},
) {
  const vaultsOf = vi.fn(async () => refs);
  const readContract = vi.fn(async (r: Read) => {
    if (o.fail) throw o.fail;
    if (r.functionName === 'vaultsOfLength') return o.length ?? BigInt(refs.length);
    if (r.functionName === 'expiresAt') return o.ends?.[r.address] ?? 0n;
    throw new Error(`unexpected ${r.functionName}`);
  });
  const getBlock = vi.fn(async () => ({ number: 42n, timestamp: o.now ?? 1_000n }));
  const sdk = {
    atro: { vaultsOf, publicClient: { getBlock, readContract } },
    deployment: { factory: FACTORY },
    rpc: { read: [], verify: [] },
  } as unknown as Sdk;
  return { sdk, vaultsOf, readContract, getBlock };
}

describe('myVaults', () => {
  it('reads the newest ME_LIMIT entries, then the index length and each Drill end at one block', async () => {
    const f = fakeSdk([ref(DRILL, true), ref(REAL, false)], { ends: { [DRILL]: 5_000n } });
    const got = await myVaults(f.sdk, PEOPLE.owner);
    expect(f.vaultsOf).toHaveBeenCalledWith(PEOPLE.owner, { limit: ME_LIMIT });
    expect(f.getBlock).toHaveBeenCalledTimes(1);
    expect(f.readContract).toHaveBeenCalledTimes(2);
    expect(f.readContract).toHaveBeenCalledWith({
      address: FACTORY,
      abi: factoryAbi,
      functionName: 'vaultsOfLength',
      args: [PEOPLE.owner],
      blockNumber: 42n,
    });
    expect(f.readContract).toHaveBeenCalledWith({
      address: DRILL,
      abi: vaultAbi,
      functionName: 'expiresAt',
      blockNumber: 42n,
    });
    expect(got).toEqual({
      vaults: [
        { ...ref(DRILL, true), expired: false },
        { ...ref(REAL, false), expired: false },
      ],
      indexed: 2n,
      limit: ME_LIMIT,
      blockNumber: 42n,
    });
  });

  it('a Drill is expired from the second its expiresAt names, as the vault itself decides', async () => {
    const before = await myVaults(
      fakeSdk([ref(DRILL, true)], { ends: { [DRILL]: 1_000n }, now: 999n }).sdk,
      PEOPLE.owner,
    );
    const at = await myVaults(
      fakeSdk([ref(DRILL, true)], { ends: { [DRILL]: 1_000n }, now: 1_000n }).sdk,
      PEOPLE.owner,
    );
    expect(before.vaults[0].expired).toBe(false);
    expect(at.vaults[0].expired).toBe(true);
  });

  it('a vault that is not a Drill never expires, and costs no read', async () => {
    const f = fakeSdk([ref(REAL, false)], { now: 10n ** 12n });
    const got = await myVaults(f.sdk, PEOPLE.owner);
    expect(got.vaults[0].expired).toBe(false);
    expect(f.readContract).toHaveBeenCalledTimes(1);
  });

  it('gives the length of the whole index, stale entries included', async () => {
    const got = await myVaults(fakeSdk([ref(REAL, false)], { length: 150n }).sdk, PEOPLE.owner);
    expect(got.indexed).toBe(150n);
    expect(got.limit).toBe(100);
  });

  it('turns an RPC failure of its own reads into the SDK error a card explains', async () => {
    const fail = new HttpRequestError({ url: 'https://rpc.invalid', status: 503 });
    const err = await myVaults(fakeSdk([ref(DRILL, true)], { fail }).sdk, PEOPLE.owner).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AtropyleError);
    expect(err).toMatchObject({ code: 'RPC_UNAVAILABLE' });
  });

  it('passes an error of vaultsOf through as it is, and reads nothing more', async () => {
    const f = fakeSdk([]);
    const boom = new AtropyleError('RPC_RATE_LIMITED');
    f.vaultsOf.mockRejectedValueOnce(boom);
    await expect(myVaults(f.sdk, PEOPLE.owner)).rejects.toBe(boom);
    expect(f.getBlock).not.toHaveBeenCalled();
  });
});

describe('failedFirst', () => {
  it('is failedEmpty of hooks.ts: a read that failed before it had data, and only that', () => {
    for (const data of [undefined, null, 0, { vaults: [] }]) {
      for (const status of ['pending', 'error', 'success']) {
        const q = { state: { data, status } };
        expect(failedFirst(q), `${String(data)} ${status}`).toBe(failedEmpty(q));
      }
    }
    expect(failedFirst({ state: { data: undefined, status: 'error' } })).toBe(true);
  });
});
