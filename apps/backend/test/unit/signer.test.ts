import { http, zeroAddress } from 'viem';
import { toAccount } from 'viem/accounts';
import { xLayer } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { KEEPER_KEY_INVALID, keeperSigner, keeperSignerFromEnv } from '../../src/keeper/signer';

const transport = http('http://127.0.0.1:1');
// A signer that holds no key: it refuses to sign, which these tests never ask it to do.
const refuse = async (): Promise<never> => {
  throw new Error('test account cannot sign');
};
const fakeAccount = () =>
  toAccount({ address: zeroAddress, signMessage: refuse, signTransaction: refuse, signTypedData: refuse });

describe('keeper signer (the one exception to the zero-key rule)', () => {
  it('runs dry when the secret is absent or blank', () => {
    expect(keeperSigner(undefined, xLayer, transport)).toEqual({ wallet: null, error: null });
    expect(keeperSigner('   ', xLayer, transport)).toEqual({ wallet: null, error: null });
    expect(keeperSignerFromEnv(() => undefined, xLayer, transport)).toEqual({ wallet: null, error: null });
  });

  it('builds a wallet client from the account and passes the value with a 0x prefix', () => {
    const seen: string[] = [];
    const s = keeperSigner('test-keeper', xLayer, transport, (k) => {
      seen.push(k);
      return fakeAccount();
    });
    expect(seen).toEqual(['0xtest-keeper']);
    expect(s.error).toBeNull();
    expect(s.wallet?.account?.address).toBe(zeroAddress);
    expect(s.wallet?.chain?.id).toBe(196);
  });

  it('turns an unusable secret into a dry run with an error that never repeats the value', () => {
    const s = keeperSigner('not-a-key', xLayer, transport);
    expect(s).toEqual({ wallet: null, error: KEEPER_KEY_INVALID });
    expect(KEEPER_KEY_INVALID).not.toContain('not-a-key');
  });
});
