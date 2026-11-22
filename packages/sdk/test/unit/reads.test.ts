import {
  createPublicClient,
  custom,
  defineChain,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Hex,
  HttpRequestError,
  type PublicClient,
  RpcRequestError,
} from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { revertAbi, vaultAbi } from '../../src/abi/index';
import { createAtropyle } from '../../src/client';
import { getDeployment } from '../../src/deployments/index';
import { AtropyleError } from '../../src/errors';
import type { Asset } from '../../src/index';
import { createReadContext } from '../../src/read/context';
import { blockRanges, decodeLogs, getEventsChunked } from '../../src/read/events';
import { netlistSource } from '../../src/read/netlists';
import { heldBy, readSnapshot } from '../../src/read/snapshot';
import { readTokenInfo } from '../../src/read/tokens';
import { MAX_BATCH, readTransport } from '../../src/transports';
import { NFT, OWNER, TOKEN, VAULT } from './fixtures';

// Every error below comes out of a real viem client (createPublicClient over a `custom` transport), so it has the
// exact shape and cause chain viem gives it, not the shape a hand-built error object would suggest.
const CHAIN = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:1'] } },
});

type Answer = (method: string, params: unknown[]) => unknown;

/** A viem client whose JSON-RPC provider answers through `answer`; a throw is a failing node. No retries. */
function clientOf(answer: Answer): PublicClient {
  const provider = { request: async (a: { method: string; params?: unknown[] }) => answer(a.method, a.params ?? []) };
  return createPublicClient({
    chain: CHAIN,
    cacheTime: 0,
    transport: custom(provider as never, { retryCount: 0 }),
  }) as PublicClient;
}

const BLOCK = { number: '0x5', timestamp: '0x64', transactions: [] };

/** A node with a vault-less chain: blocks and code are fine, `call` decides what every eth_call does. */
const nodeWith =
  (call: (data: Hex) => unknown): Answer =>
  (method, params) => {
    if (method === 'eth_getBlockByNumber') return BLOCK;
    if (method === 'eth_getCode') return '0x6001';
    if (method === 'eth_call') return call((params[0] as { data: Hex }).data);
    throw new Error(`unexpected ${method}`);
  };

const rpcError = (code: number, message: string, data?: Hex, status?: number) =>
  new RpcRequestError({
    status,
    body: { method: 'eth_call' },
    error: { code, message, data },
    url: 'https://rpc.example',
  });

const ERROR_STRING = [{ type: 'error', name: 'Error', inputs: [{ type: 'string', name: 'message' }] }] as const;
const errorString = (reason: string) => encodeErrorResult({ abi: ERROR_STRING, errorName: 'Error', args: [reason] });

const call = (functionName: 'name' | 'symbol' | 'decimals') => encodeFunctionData({ abi: erc20Abi, functionName });
const word = (text: string): Hex => `0x${Buffer.from(text).toString('hex').padEnd(64, '0')}`;

/** The contract's own answers to a read: they say something about the contract. */
const ANSWERS: [string, () => unknown][] = [
  ['a revert without a reason', () => Promise.reject(rpcError(3, 'execution reverted'))],
  ['a revert with a reason string', () => Promise.reject(rpcError(3, 'execution reverted: no', errorString('no')))],
  [
    'a revert whose reason repeats a node message',
    () => Promise.reject(rpcError(3, 'execution reverted: header not found', errorString('header not found'))),
  ],
  ['a revert in the -32000 layout', () => Promise.reject(rpcError(-32000, 'execution reverted'))],
  ['no data at all', () => '0x'],
];

/** Failures to ask: none of them says anything about the contract. */
const FAILURES: [string, () => unknown, string][] = [
  [
    'a rate limit',
    () => Promise.reject(new HttpRequestError({ url: 'https://rpc.example', status: 429 })),
    'RPC_RATE_LIMITED',
  ],
  [
    'a node that has not reached the block',
    () => Promise.reject(rpcError(-32000, 'header not found')),
    'RPC_UNAVAILABLE',
  ],
  ['a backend error (-32603)', () => Promise.reject(rpcError(-32603, 'Internal error')), 'RPC_UNAVAILABLE'],
  [
    'an endpoint that refuses the method',
    () => Promise.reject(rpcError(-32601, 'rpc method is not whitelisted', undefined, 403)),
    'UNKNOWN',
  ],
  ['a malformed response', () => Promise.reject(new Error('malformed response')), 'UNKNOWN'],
];

/** What a token that is not a well-formed ERC-20 returns for name() and symbol(). */
const GARBAGE: [string, Hex][] = [
  ['a bytes32 (MKR, old DAI)', word('MKR')],
  ['a lone offset word', `0x${'20'.padStart(64, '0')}`],
  ['an offset that points past the data', `0x${'ff'.padStart(64, '0')}${'0'.repeat(64)}`],
  ['33 bytes', `0x${'ab'.repeat(33)}`],
  ['a bool that is not 0 or 1', `0x${'5'.padStart(64, '0')}`],
];

const erc20: Asset = { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 };
const nft: Asset = { kind: 'erc721', token: NFT, id: 1n, heir: 0 };

describe('decodeLogs', () => {
  it('returns checksummed addresses even when the node sends them lowercase', () => {
    const checksummed = getAddress('0xdead00000000000000000000000000000000beef');
    const log = {
      address: checksummed.toLowerCase() as Hex,
      topics: encodeEventTopics({ abi: vaultAbi, eventName: 'Alive' }),
      data: encodeAbiParameters([{ type: 'uint64' }], [5n]),
      blockNumber: 1n,
      blockHash: `0x${'11'.repeat(32)}` as Hex,
      logIndex: 0,
      transactionHash: `0x${'22'.repeat(32)}` as Hex,
      transactionIndex: 0,
      removed: false,
    };
    const [event] = decodeLogs(vaultAbi, [log as never]);
    expect(event.address).toBe(checksummed);
    expect(event.address).not.toBe(log.address);
  });
});

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
  const local = getDeployment('local');
  const tokenOf = (c: PublicClient) => readTokenInfo(c, TOKEN, 1n);

  it('heldBy reads a token that reverts or returns nothing as 0', async () => {
    for (const [, answer] of ANSWERS) {
      const c = clientOf(nodeWith(answer));
      expect(await heldBy(c, OWNER, erc20, 1n)).toBe(0n);
      expect(await heldBy(c, OWNER, nft, 1n)).toBe(0n);
    }
  });

  it('heldBy rethrows every failure to ask, with its code', async () => {
    for (const [, failure, code] of FAILURES) {
      const c = clientOf(nodeWith(failure));
      await expect(heldBy(c, OWNER, erc20, 1n)).rejects.toMatchObject({ code });
      await expect(heldBy(c, OWNER, nft, 1n)).rejects.toMatchObject({ code });
    }
  });

  it('readTokenInfo reads a token without decimals() as decimals null, and a mute token as empty metadata', async () => {
    for (const [, answer] of ANSWERS) {
      const noDecimals = clientOf(
        nodeWith((data) => (data === call('decimals') ? answer() : encodeAbiParameters([{ type: 'string' }], ['X']))),
      );
      expect(await tokenOf(noDecimals)).toMatchObject({ symbol: { value: 'X' }, name: { value: 'X' }, decimals: null });
      expect(await tokenOf(clientOf(nodeWith(answer)))).toMatchObject({ symbol: { value: '' }, decimals: null });
    }
  });

  it('readTokenInfo reads a name() or symbol() that does not decode as empty text, whatever viem throws', async () => {
    for (const [, garbage] of GARBAGE) {
      const c = clientOf(
        nodeWith((data) => (data === call('decimals') ? encodeAbiParameters([{ type: 'uint8' }], [18]) : garbage)),
      );
      expect(await tokenOf(c)).toMatchObject({ symbol: { value: '' }, name: { value: '' }, decimals: 18 });
    }
  });

  it('readTokenInfo rethrows every failure to ask, with its code', async () => {
    for (const [, failure, code] of FAILURES) {
      const c = clientOf(
        nodeWith((data) => (data === call('decimals') ? failure() : encodeAbiParameters([{ type: 'string' }], ['X']))),
      );
      await expect(tokenOf(c)).rejects.toMatchObject({ code });
    }
  });

  it('the context does not cache a failed token read', async () => {
    for (const [, failure] of FAILURES) {
      let calls = 0;
      const c = clientOf(
        nodeWith((data) => {
          if (++calls <= 3) return failure();
          if (data === call('decimals')) return encodeAbiParameters([{ type: 'uint8' }], [6]);
          return encodeAbiParameters([{ type: 'string' }], ['USDT0']);
        }),
      );
      const ctx = createReadContext(local, c);
      await expect(ctx.token(TOKEN, 1n)).rejects.toBeInstanceOf(AtropyleError);
      expect(await ctx.token(TOKEN, 1n)).toMatchObject({ decimals: 6, symbol: { value: 'USDT0' } });
      const before = calls;
      await ctx.token(TOKEN, 1n);
      expect(calls).toBe(before);
    }
  });

  it('readSnapshot says NOT_VAULT only when the contract itself answers like a non-vault', async () => {
    const read = (answer: () => unknown) =>
      readSnapshot(createReadContext(local, clientOf(nodeWith(answer))), VAULT, 5n);
    for (const [, answer] of ANSWERS) await expect(read(answer)).rejects.toMatchObject({ code: 'NOT_VAULT' });
    for (const [, failure, code] of FAILURES) await expect(read(failure)).rejects.toMatchObject({ code });
  });

  it('readSnapshot reports an address without code as NOT_VAULT before reading anything else', async () => {
    let calls = 0;
    const c = clientOf((method) => {
      if (method === 'eth_getBlockByNumber') return BLOCK;
      if (method === 'eth_getCode') return '0x';
      calls++;
      return '0x';
    });
    await expect(readSnapshot(createReadContext(local, c), VAULT, 5n)).rejects.toMatchObject({ code: 'NOT_VAULT' });
    expect(calls).toBe(0);
  });
});

describe('netlist and engine reads leave as AtropyleErrors', () => {
  const failing = (failure: () => unknown) => clientOf(() => failure());

  it('netlistSource decodes a rate limit and a contract revert', async () => {
    const throttled = netlistSource(failing(FAILURES[0][1]), TOKEN);
    for (const read of [throttled.netlist(1n), throttled.info(1n)]) {
      const err = await read.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AtropyleError);
      expect(err).toMatchObject({ code: 'RPC_RATE_LIMITED' });
    }
    const data = encodeErrorResult({ abi: revertAbi, errorName: 'NotVault' });
    const reverts = netlistSource(
      failing(() => Promise.reject(rpcError(3, 'execution reverted', data))),
      TOKEN,
    );
    await expect(reverts.netlist(1n)).rejects.toMatchObject({ code: 'NOT_VAULT' });
  });

  it('engineFor surfaces transport failures as AtropyleErrors and asks again next time', async () => {
    let requests = 0;
    const provider = {
      request: async () => {
        requests++;
        throw new HttpRequestError({ url: 'https://rpc.example', status: 429 });
      },
    };
    const atro = createAtropyle({ chain: 'local', transport: custom(provider as never, { retryCount: 0 }) });
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

  it('stops the same way when the progress callback throws', async () => {
    const started: bigint[] = [];
    const ctx = ctxWith((a) => {
      started.push(a.fromBlock);
      return new Promise((resolve) => setTimeout(() => resolve([]), 5));
    });
    const onProgress = vi.fn(() => {
      throw new Error('callback failed');
    });
    await expect(getEventsChunked(ctx, { abi: [], fromBlock: 0n, toBlock: 39n, onProgress })).rejects.toThrow(
      'callback failed',
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    // The first 8 were in flight; the failure of the callback stopped every worker from taking another.
    expect(started).toEqual([0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n]);
    expect(onProgress).toHaveBeenCalledTimes(1);
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

  it('never sends a batch over MAX_BATCH (3), the cap of the free dRPC plan; a bigger batch fails as a whole', async () => {
    const sizes: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as { id: number } | { id: number }[];
        const calls = Array.isArray(body) ? body : [body];
        sizes.push(calls.length);
        if (calls.length > 3) return new Response('{"error":"batch too large"}', { status: 400 });
        const answers = calls.map((c) => ({ jsonrpc: '2.0', id: c.id, result: '0xc4' }));
        return new Response(JSON.stringify(Array.isArray(body) ? answers : answers[0]), { status: 200 });
      }),
    );
    const transport = readTransport(['https://a.example'])({ chain: undefined, retryCount: 0 });
    const results = await Promise.all(Array.from({ length: 10 }, () => transport.request({ method: 'eth_chainId' })));
    expect(results).toEqual(Array(10).fill('0xc4'));
    expect(MAX_BATCH).toBe(3);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_BATCH);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(10);
  });
});
