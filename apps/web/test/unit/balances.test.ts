import type { AtropyleClient } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { tokenBalances, tokenMeta } from '../../src/flows/impl/balances';
import { untrusted } from '../../src/lib/untrusted';
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

describe('tokenMeta', () => {
  const FEE = '0x5555555555555555555555555555555555555555';
  const ODD = '0x6666666666666666666666666666666666666666';

  it('reads each symbol as untrusted text and its decimals; a read that fails leaves only that one unknown', async () => {
    const readContract = async (a: { address: string; functionName: string }) => {
      if (a.address === PEOPLE.nft) throw new Error('no code');
      if (a.address === ODD) return a.functionName === 'decimals' ? 99 : '';
      if (a.address === FEE && a.functionName === 'decimals') throw new Error('reverted');
      // A zero-width space hidden in the symbol never reaches the page.
      return a.functionName === 'decimals' ? 6 : 'USD​T0';
    };
    const atro = { publicClient: { readContract } } as unknown as AtropyleClient;
    expect(await tokenMeta(atro, [PEOPLE.token, PEOPLE.nft, FEE, ODD])).toEqual([
      { token: PEOPLE.token, symbol: untrusted('USDT0'), decimals: 6 },
      { token: PEOPLE.nft, symbol: null, decimals: null },
      { token: FEE, symbol: untrusted('USDT0'), decimals: null },
      // An empty symbol and decimals out of range read as unknown.
      { token: ODD, symbol: null, decimals: null },
    ]);
  });

  it('never throws, even on a client that cannot read', async () => {
    const atro = { publicClient: {} } as unknown as AtropyleClient;
    expect(await tokenMeta(atro, [PEOPLE.token])).toEqual([{ token: PEOPLE.token, symbol: null, decimals: null }]);
  });
});
