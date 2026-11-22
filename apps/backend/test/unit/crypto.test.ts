import { describe, expect, it } from 'vitest';
import { b64url, hmacHex, randomToken, safeEqual, sha256Hex, TOKEN_RE, unsubToken } from '../../src/crypto';

describe('crypto helpers (Web Crypto, same in Node and Deno)', () => {
  it('hashes and signs with the standard test vectors', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hmacHex('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });

  it('writes base64url without padding', () => {
    expect(b64url(new Uint8Array([251, 255]))).toBe('-_8');
  });

  it('makes 43-character tokens from the injected randomness', () => {
    const t = randomToken((n) => new Uint8Array(n).fill(7));
    expect(t).toMatch(TOKEN_RE);
    expect(t).toBe(b64url(new Uint8Array(32).fill(7)));
  });

  it('derives one unsubscribe token per subscription and secret', async () => {
    const a = await unsubToken('s'.repeat(32), '1');
    expect(a).toMatch(TOKEN_RE);
    expect(await unsubToken('s'.repeat(32), '1')).toBe(a);
    expect(await unsubToken('s'.repeat(32), '2')).not.toBe(a);
    expect(await unsubToken('x'.repeat(32), '1')).not.toBe(a);
  });

  it('compares secrets without an early exit', () => {
    expect(safeEqual('same-secret', 'same-secret')).toBe(true);
    expect(safeEqual('same-secret', 'same-secreT')).toBe(false);
    expect(safeEqual('short', 'longer-value')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
