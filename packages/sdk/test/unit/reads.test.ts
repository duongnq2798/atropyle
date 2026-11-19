import {
  ContractFunctionRevertedError,
  custom,
  encodeErrorResult,
  HttpRequestError,
  type PublicClient,
  type Transport,
} from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { revertAbi } from '../../src/abi/index';
import { createAtropyle } from '../../src/client';
import { getDeployment } from '../../src/deployments/index';
import { AtropyleError } from '../../src/errors';
import type { Asset } from '../../src/index';
import { createReadContext } from '../../src/read/context';
import { blockRanges } from '../../src/read/events';
import { netlistSource } from '../../src/read/netlists';
import { heldBy, readSnapshot } from '../../src/read/snapshot';
import { readTokenInfo } from '../../src/read/tokens';
import { NFT, OWNER, TOKEN, VAULT } from './fixtures';

const limited = () => new HttpRequestError({ url: 'https://rpc.example', status: 429 });
const stub = (readContract: (...a: unknown[]) => Promise<unknown>, extra: object = {}) =>
  ({ readContract, ...extra }) as unknown as PublicClient;

const erc20: Asset = { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 };
const nft: Asset = { kind: 'erc721', token: NFT, id: 1n, heir: 0 };

describe('blockRanges', () => {
  it('splits into inclusive ranges of at most `size` blocks', () => {
    expect(blockRanges(1n, 1n, 100)).toEqual([[1n, 1n]]);
    expect(blockRanges(0n, 299n, 100)).toEqual([
      [0n, 99n],
      [100n, 199n],
      [200n, 299n],
    ]);
    expect(blockRanges(0n, 300n, 100)).toEqual([
      [0n, 99n],
      [100n, 199n],
      [200n, 299n],
      [300n, 300n],
    ]);
    expect(blockRanges(10n, 12n, 1)).toEqual([
      [10n, 10n],
      [11n, 11n],
      [12n, 12n],
    ]);
  });

  it('is empty when there is nothing to read', () => {
    expect(blockRanges(5n, 4n, 100)).toEqual([]);
  });
});

describe('failures of the RPC are not answers from the token', () => {
  it('heldBy reads a reverting token as 0 but rethrows a rate limit', async () => {
    const reverts = stub(() => Promise.reject(new Error('execution reverted')));
    expect(await heldBy(reverts, OWNER, erc20, 1n)).toBe(0n);
    expect(await heldBy(reverts, OWNER, nft, 1n)).toBe(0n);
    const throttled = stub(() => Promise.reject(limited()));
    await expect(heldBy(throttled, OWNER, erc20, 1n)).rejects.toMatchObject({ code: 'RPC_RATE_LIMITED' });
    await expect(heldBy(throttled, OWNER, nft, 1n)).rejects.toMatchObject({ code: 'RPC_RATE_LIMITED' });
  });

  it('readTokenInfo reads a silent token as empty metadata but rethrows a rate limit', async () => {
    const silent = stub(() => Promise.reject(new Error('execution reverted')));
    expect(await readTokenInfo(silent, TOKEN, 1n)).toMatchObject({
      symbol: { value: '' },
      name: { value: '' },
      decimals: null,
    });
    const throttled = stub((a) =>
      (a as { functionName: string }).functionName === 'decimals' ? Promise.reject(limited()) : Promise.resolve('X'),
    );
    await expect(readTokenInfo(throttled, TOKEN, 1n)).rejects.toMatchObject({ code: 'RPC_RATE_LIMITED' });
  });

  it('the context does not cache a failed token read', async () => {
    let calls = 0;
    const answer: Record<string, unknown> = { symbol: 'USDT0', name: 'Tether', decimals: 6 };
    const client = stub((a) => {
      calls++;
      return calls <= 3
        ? Promise.reject(limited())
        : Promise.resolve(answer[(a as { functionName: string }).functionName]);
    });
    const ctx = createReadContext(getDeployment('local'), client);
    await expect(ctx.token(TOKEN, 1n)).rejects.toMatchObject({ code: 'RPC_RATE_LIMITED' });
    expect(await ctx.token(TOKEN, 1n)).toMatchObject({ decimals: 6, symbol: { value: 'USDT0' } });
    const before = calls;
    await ctx.token(TOKEN, 1n);
    expect(calls).toBe(before);
  });

  it('readSnapshot reports a rate limit as such and a silent contract as NOT_VAULT', async () => {
    const chain = { getBlock: async () => ({ timestamp: 100n }), getCode: async () => '0x6001' };
    const throttled = stub(() => Promise.reject(limited()), chain);
    await expect(readSnapshot(createReadContext(getDeployment('local'), throttled), VAULT, 5n)).rejects.toMatchObject({
      code: 'RPC_RATE_LIMITED',
    });
    const silent = stub(() => Promise.reject(new Error('execution reverted')), chain);
    await expect(readSnapshot(createReadContext(getDeployment('local'), silent), VAULT, 5n)).rejects.toMatchObject({
      code: 'NOT_VAULT',
    });
  });

  it('readSnapshot reports an address without code as NOT_VAULT before reading anything else', async () => {
    const readContract = vi.fn();
    const client = stub(readContract, { getBlock: async () => ({ timestamp: 100n }), getCode: async () => undefined });
    await expect(readSnapshot(createReadContext(getDeployment('local'), client), VAULT, 5n)).rejects.toMatchObject({
      code: 'NOT_VAULT',
    });
    expect(readContract).not.toHaveBeenCalled();
  });
});

describe('netlist and engine reads leave as AtropyleErrors', () => {
  it('netlistSource decodes a rate limit and a contract revert', async () => {
    const throttled = netlistSource(
      stub(() => Promise.reject(limited())),
      TOKEN,
    );
    for (const read of [throttled.netlist(1n), throttled.info(1n)]) {
      const err = await read.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AtropyleError);
      expect(err).toMatchObject({ code: 'RPC_RATE_LIMITED' });
    }
    const data = encodeErrorResult({ abi: revertAbi, errorName: 'NotVault' });
    const reverts = netlistSource(
      stub(() => Promise.reject(new ContractFunctionRevertedError({ abi: [], data, functionName: 'netlist' }))),
      TOKEN,
    );
    await expect(reverts.netlist(1n)).rejects.toMatchObject({ code: 'NOT_VAULT' });
  });

  it('engineFor surfaces transport failures as AtropyleErrors and asks again next time', async () => {
    let requests = 0;
    const transport: Transport = custom(
      {
        request: async () => {
          requests++;
          throw limited();
        },
      },
      { retryCount: 0 },
    );
    const atro = createAtropyle({ chain: 'local', transport });
    const first = await atro.engineFor(TOKEN, 1n).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(AtropyleError);
    expect(first).toMatchObject({ code: 'RPC_RATE_LIMITED' });
    const after = requests;
    await expect(atro.engineFor(TOKEN, 1n)).rejects.toMatchObject({ code: 'RPC_RATE_LIMITED' });
    expect(requests).toBeGreaterThan(after);
  });
});
