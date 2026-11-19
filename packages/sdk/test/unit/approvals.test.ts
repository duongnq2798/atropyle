import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  decodeFunctionData,
  erc20Abi,
  HttpRequestError,
  InvalidInputRpcError,
  MethodNotFoundRpcError,
  type PublicClient,
  RpcRequestError,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { AtropyleError } from '../../src/errors';
import type { Asset, TokenInfo } from '../../src/index';
import { untrusted, ZERO_ADDRESS } from '../../src/index';
import { approvalDrafts, revokeDrafts } from '../../src/prepare/approvals';
import { NFT, OWNER, TOKEN, VAULT } from './fixtures';

const erc20: Asset = { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 };
const nft: Asset = { kind: 'erc721', token: NFT, id: 1n, heir: 0 };
const multi: Asset = { kind: 'erc1155', token: NFT, id: 7n, heir: 0 };
const info: TokenInfo = { address: TOKEN, symbol: untrusted('T'), name: untrusted('Token'), decimals: 6 };

/** What a healthy token answers, by function name. */
const DEFAULTS: Record<string, unknown> = {
  balanceOf: 1_000n,
  allowance: 0n,
  ownerOf: OWNER,
  getApproved: ZERO_ADDRESS,
  isApprovedForAll: false,
};

/** A client whose reads answer with DEFAULTS, except the functions in `over` (a function may throw). */
const ctx = (over: Record<string, () => unknown> = {}) => ({
  client: {
    readContract: async (a: { functionName: string }) => (over[a.functionName] ?? (() => DEFAULTS[a.functionName]))(),
  } as unknown as PublicClient,
  token: async () => info,
  blockNumber: 1n,
});
const failing = (fn: string, error: () => Error) => ctx({ [fn]: () => Promise.reject(error()) });

/** The contract's own answers to a read. */
const reverted = () => new ContractFunctionRevertedError({ abi: [], data: '0x', functionName: 'f' });
const silent = () => new ContractFunctionZeroDataError({ functionName: 'f' });

const rpcError = (status: number | undefined, code: number, message: string) =>
  new RpcRequestError({ status, body: { method: 'eth_call' }, error: { code, message }, url: 'https://rpc.example' });

/** Failures to ask: none of them is an answer from the token. */
const NOT_ANSWERS: [string, () => Error][] = [
  [
    'an endpoint that refuses the method (HTTP 403, -32601)',
    () => rpcError(403, -32601, 'rpc method is not whitelisted'),
  ],
  ['an unauthorized key (HTTP 401)', () => rpcError(401, -32000, 'unauthorized')],
  [
    'a method not found',
    () => new MethodNotFoundRpcError(rpcError(undefined, -32601, 'method not found'), { method: 'eth_call' }),
  ],
  [
    'a node that lacks the block',
    () =>
      new ContractFunctionExecutionError(new InvalidInputRpcError(rpcError(undefined, -32000, 'header not found')), {
        abi: [],
        functionName: 'f',
      }),
  ],
  ['a malformed response', () => new Error('malformed response')],
  ['a rate limit', () => new HttpRequestError({ url: 'https://rpc.example', status: 429 })],
];

/** [label, asset, the read that fails] */
const APPROVAL_READS: [string, Asset, string][] = [
  ['ERC-20 balance', erc20, 'balanceOf'],
  ['ERC-20 allowance', erc20, 'allowance'],
  ['ERC-721 owner', nft, 'ownerOf'],
  ['ERC-721 getApproved', nft, 'getApproved'],
  ['ERC-721 isApprovedForAll', nft, 'isApprovedForAll'],
  ['ERC-1155 balance', multi, 'balanceOf'],
  ['ERC-1155 isApprovedForAll', multi, 'isApprovedForAll'],
];
const REVOKE_READS: [string, Asset, string][] = [
  ['ERC-20 allowance', erc20, 'allowance'],
  ['ERC-721 isApprovedForAll', nft, 'isApprovedForAll'],
  ['ERC-721 getApproved', nft, 'getApproved'],
  ['ERC-1155 isApprovedForAll', multi, 'isApprovedForAll'],
];

describe('approval drafts', () => {
  it('approve exactly the balance, nothing when the allowance already covers it', async () => {
    const need = await approvalDrafts(ctx(), OWNER, VAULT, [erc20], 'exact');
    expect(need.drafts).toHaveLength(1);
    expect(decodeFunctionData({ abi: erc20Abi, data: need.drafts[0].data })).toMatchObject({
      functionName: 'approve',
      args: [VAULT, 1_000n],
    });
    expect((await approvalDrafts(ctx({ allowance: () => 1_000n }), OWNER, VAULT, [erc20], 'exact')).drafts).toEqual([]);
  });

  it('read a token that reverts or answers nothing as not held, whatever the asset kind', async () => {
    for (const answer of [reverted, silent]) {
      const all = ctx(Object.fromEntries(Object.keys(DEFAULTS).map((fn) => [fn, () => Promise.reject(answer())])));
      for (const asset of [erc20, nft, multi]) {
        const r = await approvalDrafts(all, OWNER, VAULT, [asset], 'exact');
        expect(r.drafts).toEqual([]);
        expect(r.warnings.map((w) => w.code)).toEqual(['TOKEN_NOT_HELD']);
      }
    }
  });

  it.each(NOT_ANSWERS)(
    'throw on %s, on every read, instead of preparing a plan without that step',
    async (_n, error) => {
      for (const [label, asset, fn] of APPROVAL_READS) {
        const err = await approvalDrafts(failing(fn, error), OWNER, VAULT, [asset], 'exact').catch((e: unknown) => e);
        expect(err, label).toBeInstanceOf(AtropyleError);
      }
    },
  );
});

describe('revoke drafts', () => {
  it('revoke an ERC-20 allowance even when the token reverts on the read', async () => {
    for (const answer of [reverted, silent]) {
      const drafts = await revokeDrafts(failing('allowance', answer), OWNER, VAULT, [erc20]);
      expect(drafts).toHaveLength(1);
      expect(decodeFunctionData({ abi: erc20Abi, data: drafts[0].data })).toMatchObject({
        functionName: 'approve',
        args: [VAULT, 0n],
      });
    }
    // Nothing to revoke when the token says the allowance is 0.
    expect(await revokeDrafts(ctx(), OWNER, VAULT, [erc20])).toEqual([]);
  });

  it('read an NFT contract that reverts on the approval reads as holding no approval', async () => {
    const all = ctx({
      isApprovedForAll: () => Promise.reject(reverted()),
      getApproved: () => Promise.reject(reverted()),
    });
    expect(await revokeDrafts(all, OWNER, VAULT, [nft, multi])).toEqual([]);
  });

  it.each(NOT_ANSWERS)('throw on %s, on every read, instead of dropping a revocation', async (_n, error) => {
    for (const [label, asset, fn] of REVOKE_READS) {
      const err = await revokeDrafts(failing(fn, error), OWNER, VAULT, [asset]).catch((e: unknown) => e);
      expect(err, label).toBeInstanceOf(AtropyleError);
    }
  });
});
