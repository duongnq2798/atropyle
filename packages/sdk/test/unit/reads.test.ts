import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  custom,
  encodeErrorResult,
  HttpRequestError,
  InvalidInputRpcError,
  type PublicClient,
  RpcRequestError,
  type Transport,
} from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { revertAbi } from '../../src/abi/index';
import { createAtropyle } from '../../src/client';
import { getDeployment } from '../../src/deployments/index';
import { AtropyleError } from '../../src/errors';
import type { Asset } from '../../src/index';
import { createReadContext } from '../../src/read/context';
import { blockRanges, getEventsChunked } from '../../src/read/events';
import { netlistSource } from '../../src/read/netlists';
import { heldBy, readSnapshot } from '../../src/read/snapshot';
import { readTokenInfo } from '../../src/read/tokens';
import { readTransport } from '../../src/transports';
import { NFT, OWNER, TOKEN, VAULT } from './fixtures';

const limited = () => new HttpRequestError({ url: 'https://rpc.example', status: 429 });

const nodeError = (message: string) =>
  new InvalidInputRpcError(
    new RpcRequestError({ body: { method: 'eth_call' }, error: { code: -32000, message }, url: 'https://rpc.example' }),
  );
/** What a node that has not reached the requested block answers (a lagging member of a load-balanced pool). */
const staleNode = () =>
  new ContractFunctionExecutionError(nodeError('header not found'), { abi: [], functionName: 'f' });
/** The contract's own answer: viem turns an `execution reverted` response into this. */
const reverted = () => new ContractFunctionRevertedError({ abi: [], data: '0x', functionName: 'f' });
const silent = () => new ContractFunctionZeroDataError({ functionName: 'f' });
const malformed = () => new Error('malformed response');

const stub = (readContract: (...a: unknown[]) => Promise<unknown>, extra: object = {}) =>
  ({ readContract, ...extra }) as unknown as PublicClient;
const nameOf = (a: unknown) => (a as { functionName: string }).functionName;

const erc20: Asset = { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 };
const nft: Asset = { kind: 'erc721', token: NFT, id: 1n, heir: 0 };

/** Every way the RPC (not the contract) can fail, with the code it must surface as. */
const FAILURES = [
  [limited, 'RPC_RATE_LIMITED'],
  [staleNode, 'RPC_UNAVAILABLE'],
  [malformed, 'UNKNOWN'],
] as const;

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

describe('failures of the RPC are not answers from the contract', () => {
  const chain = { getBlock: async () => ({ timestamp: 100n }), getCode: async () => '0x6001' };
  const local = getDeployment('local');

  it('heldBy reads a reverting or silent token as 0 and rethrows every other failure', async () => {
    for (const answer of [reverted, silent]) {
      expect(
        await heldBy(
          stub(() => Promise.reject(answer())),
          OWNER,
          erc20,
          1n,
        ),
      ).toBe(0n);
      expect(
        await heldBy(
          stub(() => Promise.reject(answer())),
          OWNER,
          nft,
          1n,
        ),
      ).toBe(0n);
    }
    for (const [failure, code] of FAILURES) {
      const client = stub(() => Promise.reject(failure()));
      await expect(heldBy(client, OWNER, erc20, 1n)).rejects.toMatchObject({ code });
      await expect(heldBy(client, OWNER, nft, 1n)).rejects.toMatchObject({ code });
    }
  });

  it('a token cannot pass for an unavailable RPC by reverting with the node text', async () => {
    const lying = new ContractFunctionRevertedError({
      abi: [],
      data: '0x',
      functionName: 'f',
      message: 'execution reverted: header not found',
    });
    expect(
      await heldBy(
        stub(() => Promise.reject(lying)),
        OWNER,
        erc20,
        1n,
      ),
    ).toBe(0n);
    // A node that reports the revert in the -32000 layout instead of code 3.
    const viaNode = new ContractFunctionExecutionError(nodeError('execution reverted: header not found'), {
      abi: [],
      functionName: 'f',
    });
    expect(
      await heldBy(
        stub(() => Promise.reject(viaNode)),
        OWNER,
        erc20,
        1n,
      ),
    ).toBe(0n);
  });

  it('readTokenInfo reads a token without decimals() as decimals null and rethrows every other failure', async () => {
    const noDecimals = stub((a) => (nameOf(a) === 'decimals' ? Promise.reject(reverted()) : Promise.resolve('X')));
    expect(await readTokenInfo(noDecimals, TOKEN, 1n)).toMatchObject({
      symbol: { value: 'X' },
      name: { value: 'X' },
      decimals: null,
    });
    const mute = stub(() => Promise.reject(reverted()));
    expect(await readTokenInfo(mute, TOKEN, 1n)).toMatchObject({ symbol: { value: '' }, decimals: null });
    for (const [failure, code] of FAILURES) {
      const client = stub((a) => (nameOf(a) === 'decimals' ? Promise.reject(failure()) : Promise.resolve('X')));
      await expect(readTokenInfo(client, TOKEN, 1n)).rejects.toMatchObject({ code });
    }
  });

  it('the context does not cache a failed token read', async () => {
    for (const [failure] of FAILURES) {
      let calls = 0;
      const answer: Record<string, unknown> = { symbol: 'USDT0', name: 'Tether', decimals: 6 };
      const client = stub((a) => {
        calls++;
        return calls <= 3 ? Promise.reject(failure()) : Promise.resolve(answer[nameOf(a)]);
      });
      const ctx = createReadContext(local, client);
      await expect(ctx.token(TOKEN, 1n)).rejects.toBeInstanceOf(AtropyleError);
      expect(await ctx.token(TOKEN, 1n)).toMatchObject({ decimals: 6, symbol: { value: 'USDT0' } });
      const before = calls;
      await ctx.token(TOKEN, 1n);
      expect(calls).toBe(before);
    }
  });

  it('readSnapshot says NOT_VAULT only when the contract itself answers like a non-vault', async () => {
    const read = (failure: () => unknown) =>
      readSnapshot(
        createReadContext(
          local,
          stub(() => Promise.reject(failure()), chain),
        ),
        VAULT,
        5n,
      );
    await expect(read(reverted)).rejects.toMatchObject({ code: 'NOT_VAULT' });
    await expect(read(silent)).rejects.toMatchObject({ code: 'NOT_VAULT' });
    for (const [failure, code] of FAILURES) await expect(read(failure)).rejects.toMatchObject({ code });
  });

  it('readSnapshot reports an address without code as NOT_VAULT before reading anything else', async () => {
    const readContract = vi.fn();
    const client = stub(readContract, { getBlock: async () => ({ timestamp: 100n }), getCode: async () => undefined });
    await expect(readSnapshot(createReadContext(local, client), VAULT, 5n)).rejects.toMatchObject({
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

describe('getEventsChunked after a failed range', () => {
  const ctxWith = (getLogs: (a: { fromBlock: bigint }) => Promise<unknown[]>) =>
    createReadContext({ ...getDeployment('local'), logsBlockRange: 1 }, { getLogs } as unknown as PublicClient);

  it('stops taking ranges and reporting progress once one range has failed', async () => {
    const started: bigint[] = [];
    const ctx = ctxWith((a) => {
      started.push(a.fromBlock);
      // Block 2 fails at once; the others answer later, after the failure was seen.
      return a.fromBlock === 2n
        ? Promise.reject(new Error('range failed'))
        : new Promise((resolve) => setTimeout(() => resolve([]), 10));
    });
    const onProgress = vi.fn();
    await expect(getEventsChunked(ctx, { abi: [], fromBlock: 0n, toBlock: 39n, onProgress })).rejects.toThrow(
      'range failed',
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    // Only the first 8 ranges (the cap) were requested; none of the other 32 after the failure.
    expect(started).toEqual([0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n]);
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('readTransport attempts', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('makes 1 + 3 attempts per URL, not a multiple of them from nested retries', async () => {
    vi.useFakeTimers();
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(String(url));
        return new Response('{}', { status: 503 });
      }),
    );
    const transport = readTransport(['https://a.example', 'https://b.example'])({ chain: undefined, retryCount: 3 });
    const outcome = transport.request({ method: 'eth_chainId' }).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await outcome).toBeInstanceOf(Error);
    expect(fetched.filter((u) => u.includes('a.example'))).toHaveLength(4);
    expect(fetched.filter((u) => u.includes('b.example'))).toHaveLength(4);
  });
});
