// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { chainKeys } from '../../src/chain/keys';
import { errorCode, PERMANENT_CODES, shouldRetry } from '../../src/chain/query-client';

const fail = (code: string) => Object.assign(new Error(code), { code });

describe('query client', () => {
  it('retries a passing failure twice and a permanent one never', () => {
    expect(shouldRetry(0, fail('RPC_UNAVAILABLE'))).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(2, fail('RPC_UNAVAILABLE'))).toBe(false);
    for (const code of PERMANENT_CODES) expect(shouldRetry(0, fail(code)), code).toBe(false);
    expect(errorCode('text')).toBeNull();
    expect(errorCode({ code: 7 })).toBeNull();
  });

  it('builds keys from plain strings and numbers only, addresses lowercased', () => {
    const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
    const keys = [
      chainKeys.all(196),
      chainKeys.sdk(196, true),
      chainKeys.vault(196, A),
      chainKeys.vaultsOf(196, A),
      chainKeys.stats(196, 'chain'),
      chainKeys.me(196, A),
      chainKeys.health(196),
    ];
    for (const k of keys) {
      expect(JSON.parse(JSON.stringify(k))).toEqual(k);
      for (const part of k) expect(['string', 'number']).toContain(typeof part);
    }
    expect(chainKeys.vault(196, A)).toEqual(['atropyle', 196, 'vault', A.toLowerCase()]);
    expect(chainKeys.sdk(196, false)).toEqual(['atropyle', 196, 'sdk', 'own']);
  });
});
