import { custom, encodeErrorResult, HttpRequestError, RpcRequestError, type Transport, type WalletClient } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { type AtropyleClient, createAtropyle } from '../../src/client';
import { getDeployment } from '../../src/deployments/index';
import { AtropyleError } from '../../src/errors';
import type { SignPayload, TxPlan } from '../../src/index';
import { HEIR_A, OWNER, TOKEN, VAULT } from './fixtures';

const SALT = `0x${'11'.repeat(32)}` as const;
const PLAN = { heirs: [{ account: HEIR_A }], timing: 'drill' };
const SIGN_REQUEST: SignPayload = {
  chainId: 31337,
  from: OWNER,
  steps: [{ to: VAULT, data: '0x183ff085', value: 0n }],
};
const SENT_PLAN = {
  chainId: 31337,
  from: OWNER,
  vault: VAULT,
  steps: [],
  summary: 'A plan.',
  warnings: [],
} satisfies TxPlan;

const calls: [string, (atro: AtropyleClient) => Promise<unknown>][] = [
  ['engine', (a) => a.engine()],
  ['engineFor', (a) => a.engineFor(TOKEN, 1n)],
  ['fees', (a) => a.fees()],
  ['vaultsOf', (a) => a.vaultsOf(OWNER)],
  ['predictVault', (a) => a.predictVault(OWNER, SALT)],
  ['stats', (a) => a.stats()],
  ['scan', (a) => a.scan()],
  ['vault.snapshot', (a) => a.vault(VAULT).snapshot()],
  ['vault.registered', (a) => a.vault(VAULT).registered()],
  ['vault.status', (a) => a.vault(VAULT).status()],
  ['vault.config', (a) => a.vault(VAULT).config()],
  ['vault.roleOf', (a) => a.vault(VAULT).roleOf(OWNER)],
  ['vault.timeline', (a) => a.vault(VAULT).timeline()],
  ['vault.events', (a) => a.vault(VAULT).events()],
  ['vault.whatIf', (a) => a.vault(VAULT).whatIf({ type: 'poke' }, { as: OWNER })],
  ['vault.prepare', (a) => a.vault(VAULT).prepare({ type: 'checkIn' }, { as: OWNER })],
  ['prepare.createVault', (a) => a.prepare.createVault(PLAN, { owner: OWNER, drill: true })],
  ['checkPlan', (a) => a.checkPlan(PLAN, { owner: OWNER, drill: true })],
  ['handoff.inspect', (a) => a.handoff.inspect(SIGN_REQUEST)],
  ['verifyPolicy', (a) => a.verifyPolicy()],
  ['integrity', (a) => a.integrity()],
  ['vault.verify', (a) => a.vault(VAULT).verify()],
];

/** A client whose RPC always fails with `error`. */
function failing(error: () => Error): AtropyleClient {
  const transport: Transport = custom(
    {
      request: async () => {
        throw error();
      },
    },
    { retryCount: 0 },
  );
  return createAtropyle({ chain: 'local', transport, verifyTransports: [transport] });
}

describe('the client leaves every read and prepare as an AtropyleError', () => {
  it.each(calls)('%s reports a rate limit as RPC_RATE_LIMITED', async (_name, call) => {
    const atro = failing(() => new HttpRequestError({ url: 'https://rpc.example', status: 429 }));
    const err = await call(atro).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AtropyleError);
    expect(err).toMatchObject({ code: 'RPC_RATE_LIMITED' });
  });

  it.each(calls)('%s wraps an unexpected failure instead of leaking it', async (_name, call) => {
    const atro = failing(() => new Error('boom'));
    const err = await call(atro).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AtropyleError);
  });

  it('rejects an action type it does not know by name, before any RPC call', async () => {
    const atro = failing(() => new Error('never reached'));
    const hidden = `drop table\u{202E}\u{0007}${'x'.repeat(500)}`;
    for (const action of [{ type: hidden }, {}, null, 'checkIn']) {
      for (const call of [
        () => atro.vault(VAULT).prepare(action as never, { as: OWNER }),
        () => atro.vault(VAULT).whatIf(action as never, { as: OWNER }),
      ]) {
        const err = await call().catch((e: unknown) => e);
        expect(err).toMatchObject({ code: 'INVALID_OPTIONS', details: { path: 'type' } });
        const { message } = err as AtropyleError;
        expect(message).toMatch(/^type: unknown action ".{0,41}"; use one of checkIn, /);
        expect(message).not.toContain('\u{202E}');
        expect(message).not.toContain('\u{0007}');
      }
    }
  });

  it('rejects, rather than throws, for a bad address argument', async () => {
    const atro = failing(() => new Error('never reached'));
    await expect(atro.predictVault('nope', SALT)).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    await expect(atro.vault(VAULT).roleOf('nope')).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });

  it('rejects a P9 seed outside 0 to 2^64 - 1 before any RPC call', async () => {
    const atro = failing(() => new Error('never reached'));
    await expect(atro.verifyPolicy({ p9Seed: -1n })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(atro.verifyPolicy({ p9Seed: 2n ** 64n })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });

  it('send reports a failing wallet as an AtropyleError', async () => {
    const wallet = {
      account: { address: OWNER },
      getChainId: async () => {
        throw new HttpRequestError({ url: 'https://rpc.example', status: 429 });
      },
    } as unknown as WalletClient;
    const err = await failing(() => new Error('never reached'))
      .send(SENT_PLAN, wallet)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AtropyleError);
    expect(err).toMatchObject({ code: 'RPC_RATE_LIMITED' });
  });

  it('the handoff formats reject bad input as AtropyleErrors', () => {
    const atro = failing(() => new Error('never reached'));
    const tx = { chainId: 31337, from: OWNER, to: VAULT, data: '0x183ff085', value: 0n } as const;
    expect(() => atro.handoff.parse('https://x.test/#/v/0xabc')).toThrow(
      expect.objectContaining({ code: 'LINK_INVALID' }),
    );
    expect(() => atro.handoff.link(SIGN_REQUEST, 'not a url')).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    );
    expect(() => atro.handoff.cast(tx, 'https://x.test; rm -rf ~')).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    );
    expect(() => atro.handoff.okx({ ...tx, value: 1n })).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }));
  });

  it('the handoff formats default to the deployment', () => {
    const atro = failing(() => new Error('never reached'));
    const tx = { chainId: 31337, from: OWNER, to: VAULT, data: '0x183ff085', value: 0n } as const;
    expect(atro.handoff.cast(tx)).toContain(`--rpc-url ${atro.deployment.rpcUrls[0]}`);
    expect(atro.handoff.calls(SIGN_REQUEST).chainId).toBe('0x7a69');
    if (atro.deployment.webUrl) expect(atro.handoff.link(SIGN_REQUEST)).toContain('#/sign?p=');
    else expect(() => atro.handoff.link(SIGN_REQUEST)).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }));
  });
});

describe('CCIP read', () => {
  it('is off: a hostile OffchainLookup revert is an error and nothing is fetched', async () => {
    // OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)
    const lookup = encodeErrorResult({
      abi: [
        {
          type: 'error',
          name: 'OffchainLookup',
          inputs: [
            { type: 'address', name: 'sender' },
            { type: 'string[]', name: 'urls' },
            { type: 'bytes', name: 'callData' },
            { type: 'bytes4', name: 'callbackFunction' },
            { type: 'bytes', name: 'extraData' },
          ],
        },
      ],
      errorName: 'OffchainLookup',
      args: [TOKEN, ['https://attacker.invalid/{sender}/{data}'], '0x1234', '0x12345678', '0x'],
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));
    const methods: string[] = [];
    const transport: Transport = custom(
      {
        request: async ({ method }: { method: string }) => {
          methods.push(method);
          if (method === 'eth_call') {
            throw new RpcRequestError({
              body: { method },
              error: { code: 3, message: 'execution reverted', data: lookup },
              url: 'https://rpc.example',
            });
          }
          if (method === 'eth_blockNumber') return '0x5';
          if (method === 'eth_getBlockByNumber') return { number: '0x5', timestamp: '0x64', transactions: [] };
          if (method === 'eth_getCode') return '0x6001';
          throw new Error(`unexpected ${method}`);
        },
      },
      { retryCount: 0 },
    );
    const atro = createAtropyle({ chain: 'local', transport });
    expect(atro.publicClient.ccipRead).toBe(false);
    const err = await atro.publicClient.call({ to: TOKEN, data: '0x70a08231' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(methods).toContain('eth_call');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it('the verify client has CCIP read off as well', async () => {
    const lookup = encodeErrorResult({
      abi: [
        {
          type: 'error',
          name: 'OffchainLookup',
          inputs: [
            { type: 'address', name: 'sender' },
            { type: 'string[]', name: 'urls' },
            { type: 'bytes', name: 'callData' },
            { type: 'bytes4', name: 'callbackFunction' },
            { type: 'bytes', name: 'extraData' },
          ],
        },
      ],
      errorName: 'OffchainLookup',
      args: [
        getDeployment('local').factory,
        ['https://attacker.invalid/{sender}/{data}'],
        '0x1234',
        '0x12345678',
        '0x',
      ],
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));
    const transport: Transport = custom(
      {
        request: async ({ method }: { method: string }) => {
          if (method === 'eth_blockNumber') return '0x5';
          if (method === 'eth_getBlockByNumber')
            return { hash: '0xabc', number: '0x5', timestamp: '0x64', transactions: [] };
          if (method === 'eth_getCode') return '0x6001';
          throw new RpcRequestError({
            body: { method },
            error: { code: 3, message: 'execution reverted', data: lookup },
            url: 'https://rpc.example',
          });
        },
      },
      { retryCount: 0 },
    );
    const atro = createAtropyle({ chain: 'local', transport, verifyTransports: [transport] });
    await expect(atro.integrity()).rejects.toBeInstanceOf(AtropyleError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
