import { AtropyleError } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { assertRpcChain } from '../../src/ops/index';

const URL_WITH_KEY = 'https://rpc.example.test/v1/secret-key-123';
const answering =
  (body: unknown, status = 200): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const codeOf = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(AtropyleError);
  expect(JSON.stringify((e as AtropyleError).toJSON())).not.toContain('secret-key');
  expect((e as AtropyleError).message).toMatch(/^The RPC /);
  expect((e as AtropyleError).message).not.toContain('--');
  return (e as AtropyleError).code;
};

describe('assertRpcChain', () => {
  it('accepts an RPC that serves the expected chain', async () => {
    await expect(
      assertRpcChain(URL_WITH_KEY, 31337, { fetch: answering({ jsonrpc: '2.0', id: 1, result: '0x7a69' }) }),
    ).resolves.toBeUndefined();
  });

  it('rejects an RPC that serves another chain, without echoing the URL', async () => {
    const p = assertRpcChain(URL_WITH_KEY, 31337, { fetch: answering({ jsonrpc: '2.0', id: 1, result: '0xc4' }) });
    expect(await codeOf(p)).toBe('WRONG_CHAIN');
    await expect(p).rejects.toMatchObject({ details: { expected: 31337, actual: 196 } });
  });

  it('maps HTTP 429 to RPC_RATE_LIMITED', async () => {
    expect(await codeOf(assertRpcChain(URL_WITH_KEY, 196, { fetch: answering({}, 429) }))).toBe('RPC_RATE_LIMITED');
  });

  it('maps network errors and bad answers to RPC_UNAVAILABLE', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError(`fetch failed: ${URL_WITH_KEY}`);
    };
    expect(await codeOf(assertRpcChain(URL_WITH_KEY, 196, { fetch: down }))).toBe('RPC_UNAVAILABLE');
    expect(
      await codeOf(assertRpcChain(URL_WITH_KEY, 196, { fetch: answering({ jsonrpc: '2.0', id: 1, result: 'nope' }) })),
    ).toBe('RPC_UNAVAILABLE');
  });
});
