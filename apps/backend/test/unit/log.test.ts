import { describe, expect, it } from 'vitest';
import { errorText } from '../../src/log';

/** The shape of a viem transport error: its message names the RPC URL, which can hold an API key. */
const RPC_ERROR =
  'HTTP request failed.\n\nStatus: 503\nURL: https://rpc.example/key-abc\nRequest body: {"method":"eth_blockNumber"}';

describe('errorText (M6)', () => {
  it('replaces every URL with <url>, so an RPC key never reaches a log or a response', () => {
    const t = errorText(new Error(RPC_ERROR));
    expect(t).not.toContain('key-abc');
    expect(t).toBe('HTTP request failed.\n\nStatus: 503\nURL: <url>\nRequest body: {"method":"eth_blockNumber"}');
    expect(
      errorText('fell back from wss://ws.example/k1 to https://a.example/?apikey=k2, then postgres://u:pw@db/x'),
    ).toBe('fell back from <url> to <url>, then <url>');
  });

  it('keeps the text around a URL, and text without one, as it is', () => {
    expect(errorText(new Error('db down'))).toBe('db down');
    expect(errorText(new Error('Refused by https://x.example/k1. (see https://y.example/k2)'))).toBe(
      'Refused by <url>. (see <url>)',
    );
    expect(errorText(42)).toBe('42');
  });
});
