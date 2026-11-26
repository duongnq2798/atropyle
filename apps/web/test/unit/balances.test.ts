import type { AtropyleClient } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { tokenBalances } from '../../src/flows/impl/balances';
import { PEOPLE } from './fixtures';

describe('tokenBalances', () => {
  it('reads each token, and one that fails never hides the others', async () => {
    const readContract = async (a: { address: string; functionName: string }) => {
      if (a.address === PEOPLE.nft) throw new Error('no code');
      return a.functionName === 'decimals' ? 6 : 1_500_000n;
    };
    const atro = { publicClient: { readContract } } as unknown as AtropyleClient;
    expect(await tokenBalances(atro, PEOPLE.owner, [PEOPLE.token, PEOPLE.nft])).toEqual([
      { token: PEOPLE.token, balance: 1_500_000n, decimals: 6 },
      { token: PEOPLE.nft, balance: null, decimals: null },
    ]);
  });
});
