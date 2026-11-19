import { decodeFunctionData, erc20Abi, HttpRequestError, type PublicClient } from 'viem';
import { describe, expect, it } from 'vitest';
import type { Asset, TokenInfo } from '../../src/index';
import { untrusted } from '../../src/index';
import { approvalDrafts, revokeDrafts } from '../../src/prepare/approvals';
import { OWNER, TOKEN, VAULT } from './fixtures';

const erc20: Asset = { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 };
const info: TokenInfo = { address: TOKEN, symbol: untrusted('T'), name: untrusted('Token'), decimals: 6 };
const ctx = (readContract: (a: { functionName: string }) => Promise<unknown>) => ({
  client: { readContract } as unknown as PublicClient,
  token: async () => info,
  blockNumber: 1n,
});
const limited = () => new HttpRequestError({ url: 'https://rpc.example', status: 429 });

describe('approval drafts', () => {
  it('approve exactly the balance, nothing when the allowance already covers it', async () => {
    const read = (allowance: bigint) => async (a: { functionName: string }) =>
      a.functionName === 'balanceOf' ? 1_000n : allowance;
    const need = await approvalDrafts(ctx(read(0n)), OWNER, VAULT, [erc20], 'exact');
    expect(need.drafts).toHaveLength(1);
    expect(decodeFunctionData({ abi: erc20Abi, data: need.drafts[0].data })).toMatchObject({
      functionName: 'approve',
      args: [VAULT, 1_000n],
    });
    expect((await approvalDrafts(ctx(read(1_000n)), OWNER, VAULT, [erc20], 'exact')).drafts).toEqual([]);
  });

  it('read a reverting token as not held, but rethrow a rate limited RPC', async () => {
    const reverts = ctx(async () => {
      throw new Error('execution reverted');
    });
    const held = await approvalDrafts(reverts, OWNER, VAULT, [erc20], 'exact');
    expect(held.drafts).toEqual([]);
    expect(held.warnings.map((w) => w.code)).toEqual(['TOKEN_NOT_HELD']);
    expect(await revokeDrafts(reverts, OWNER, VAULT, [erc20])).toEqual([]);
    const throttled = ctx(async () => {
      throw limited();
    });
    await expect(approvalDrafts(throttled, OWNER, VAULT, [erc20], 'exact')).rejects.toMatchObject({
      code: 'RPC_RATE_LIMITED',
    });
    await expect(revokeDrafts(throttled, OWNER, VAULT, [erc20])).rejects.toMatchObject({ code: 'RPC_RATE_LIMITED' });
  });
});
