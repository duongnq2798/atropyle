import {
  type Address,
  type Hex,
  HttpRequestError,
  type PublicClient,
  ResourceUnavailableRpcError,
  RpcRequestError,
  UserRejectedRequestError,
  type WalletClient,
} from 'viem';
import { describe, expect, it } from 'vitest';
import type { PreparedTx, ReadContext, TxPlan } from '../../src/index';
import { sendPlan } from '../../src/send';
import { NFT, OWNER, TOKEN, VAULT } from './fixtures';

const FACTORY = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address;
const HASH = `0x${'ab'.repeat(32)}` as Hex;
const RECEIPT = { status: 'success', blockNumber: 7n, gasUsed: 50_000n, logs: [] };

const step = (o: Partial<PreparedTx> = {}): PreparedTx => ({
  chainId: 31337,
  from: OWNER,
  to: VAULT,
  data: '0x183ff085',
  value: 0n,
  action: 'checkIn',
  summary: 'Check in.',
  warnings: [],
  simulation: { ok: true, gas: 100_000n },
  ...o,
});
const planOf = (...steps: PreparedTx[]): TxPlan => ({
  chainId: 31337,
  from: OWNER,
  vault: VAULT,
  steps,
  summary: 'A plan.',
  warnings: [],
});

type SendArgs = { account: unknown; gas?: bigint; to: Address };

function fakeWallet(
  send: (args: SendArgs, n: number) => Promise<Hex> = async () => HASH,
  o: { account?: Address | null; addresses?: Address[]; chainId?: number } = {},
) {
  const calls: SendArgs[] = [];
  const wallet = {
    account: o.account === null ? undefined : { address: o.account ?? OWNER },
    getAddresses: async () => o.addresses ?? [OWNER],
    getChainId: async () => o.chainId ?? 31337,
    sendTransaction: async (args: SendArgs) => {
      calls.push(args);
      return send(args, calls.length);
    },
  } as unknown as WalletClient;
  return { wallet, calls };
}

function fakeCtx(o: { estimate?: () => Promise<bigint>; receipt?: () => Promise<unknown> } = {}) {
  const estimates: { account: Address; to: Address }[] = [];
  const client = {
    estimateGas: async (a: { account: Address; to: Address }) => {
      estimates.push(a);
      return o.estimate ? o.estimate() : 90_000n;
    },
    waitForTransactionReceipt: async () => (o.receipt ? o.receipt() : RECEIPT),
  } as unknown as PublicClient;
  const ctx = { deployment: { factory: FACTORY }, client, log: () => {} } as unknown as ReadContext;
  return { ctx, estimates };
}

const limited = () => new HttpRequestError({ url: 'https://rpc.example', status: 429 });

describe('sendPlan gas', () => {
  it('sends with the simulated gas times the buffer, 1.3 by default', async () => {
    const { wallet, calls } = fakeWallet();
    await sendPlan(fakeCtx().ctx, planOf(step()), wallet);
    expect(calls.map((c) => c.gas)).toEqual([130_000n]);
  });

  it('takes the buffer from the options, without float drift', async () => {
    const { wallet, calls } = fakeWallet();
    await sendPlan(fakeCtx().ctx, planOf(step(), step()), wallet, { gasBuffer: 1.1 });
    await sendPlan(fakeCtx().ctx, planOf(step()), wallet, { gasBuffer: 2 });
    expect(calls.map((c) => c.gas)).toEqual([110_000n, 110_000n, 200_000n]);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, 11])(
    'refuses the gas buffer %s before anything is sent',
    async (b) => {
      const { wallet, calls } = fakeWallet();
      await expect(sendPlan(fakeCtx().ctx, planOf(step()), wallet, { gasBuffer: b })).rejects.toMatchObject({
        code: 'INVALID_OPTIONS',
      });
      expect(calls).toHaveLength(0);
    },
  );
});

describe('sendPlan accounts and chains', () => {
  it('refuses a wallet on another account or chain without sending', async () => {
    const stranger = fakeWallet(undefined, { account: NFT });
    await expect(sendPlan(fakeCtx().ctx, planOf(step()), stranger.wallet)).rejects.toMatchObject({
      code: 'WRONG_ACCOUNT',
      details: { expected: OWNER, actual: NFT },
    });
    const elsewhere = fakeWallet(undefined, { chainId: 196 });
    await expect(sendPlan(fakeCtx().ctx, planOf(step()), elsewhere.wallet)).rejects.toMatchObject({
      code: 'WRONG_CHAIN',
      details: { expected: 31337, actual: 196 },
    });
    expect(stranger.calls.length + elsewhere.calls.length).toBe(0);
  });

  it('finds the signer among the accounts of a wallet that has none selected', async () => {
    const { wallet, calls } = fakeWallet(undefined, {
      account: null,
      addresses: [NFT, OWNER.toLowerCase() as Address],
    });
    await sendPlan(fakeCtx().ctx, planOf(step()), wallet);
    expect(calls[0].account).toBe(OWNER.toLowerCase());
    const none = fakeWallet(undefined, { account: null, addresses: [] });
    await expect(sendPlan(fakeCtx().ctx, planOf(step()), none.wallet)).rejects.toMatchObject({
      code: 'WRONG_ACCOUNT',
      details: { actual: null },
    });
  });
});

describe('sendPlan simulations', () => {
  const revert = {
    ok: false,
    error: { code: 'NOT_OWNER', message: 'Only the vault owner can do this.', hint: '', docsUrl: '' },
  } as const;

  it('never sends a step whose simulation failed, and says how many steps were done', async () => {
    const { wallet, calls } = fakeWallet();
    const bad = planOf(step(), step({ simulation: revert }), step());
    const failed = await sendPlan(fakeCtx().ctx, bad, wallet).catch((e) => e);
    expect(failed).toMatchObject({ code: 'NOT_OWNER', details: { index: 1, completed: 1 } });
    expect(failed.message).toContain('Step 2 (checkIn) would revert');
    expect(calls).toHaveLength(1);
  });

  it('simulates createVault again right before sending, and sends with that gas', async () => {
    const { wallet, calls } = fakeWallet();
    const { ctx, estimates } = fakeCtx({ estimate: async () => 120_000n });
    await sendPlan(ctx, planOf(step({ action: 'createVault', to: FACTORY })), wallet);
    expect(estimates).toEqual([expect.objectContaining({ account: OWNER, to: FACTORY })]);
    expect(calls.map((c) => c.gas)).toEqual([156_000n]);
  });

  it('does not send a createVault that would revert now', async () => {
    const { wallet, calls } = fakeWallet();
    const reverted = new RpcRequestError({
      body: { method: 'eth_estimateGas' },
      error: { code: 3, message: 'execution reverted' },
      url: 'https://rpc.example',
    });
    const { ctx } = fakeCtx({
      estimate: async () => {
        throw reverted;
      },
    });
    await expect(sendPlan(ctx, planOf(step({ action: 'createVault', to: FACTORY })), wallet)).rejects.toMatchObject({
      code: 'UNKNOWN',
      details: { index: 0, completed: 0 },
      message: expect.stringContaining('Step 1 (createVault) would revert'),
    });
    expect(calls).toHaveLength(0);
  });

  it('reads a failing endpoint as itself, not as a revert', async () => {
    const { wallet, calls } = fakeWallet();
    const { ctx } = fakeCtx({
      estimate: async () => {
        throw limited();
      },
    });
    const failed = await sendPlan(ctx, planOf(step({ action: 'createVault', to: FACTORY })), wallet).catch((e) => e);
    expect(failed).toMatchObject({ code: 'RPC_RATE_LIMITED', details: { index: 0, completed: 0 } });
    expect(failed.message).not.toContain('would revert');
    expect(calls).toHaveLength(0);
  });

  it('simulates a skipped step again once the earlier steps are on chain', async () => {
    const skipped = step({
      to: TOKEN,
      action: 'approve',
      simulation: { ok: 'skipped', reason: 'DEPENDS_ON_PREVIOUS_STEP' },
    });
    const ok = fakeWallet();
    const good = fakeCtx({ estimate: async () => 60_000n });
    await sendPlan(good.ctx, planOf(step(), skipped), ok.wallet);
    expect(good.estimates.map((e) => e.to)).toEqual([TOKEN]);
    expect(ok.calls.map((c) => c.gas)).toEqual([130_000n, 78_000n]);

    const none = fakeWallet();
    const failing = fakeCtx({
      estimate: async () => {
        throw new RpcRequestError({
          body: { method: 'eth_estimateGas' },
          error: { code: 3, message: 'execution reverted' },
          url: 'https://rpc.example',
        });
      },
    });
    await expect(sendPlan(failing.ctx, planOf(step(), skipped), none.wallet)).rejects.toMatchObject({
      details: { index: 1, completed: 1 },
    });
    expect(none.calls).toHaveLength(1);
  });
});

describe('sendPlan never retries the wallet', () => {
  const refusals: [string, () => Error, string][] = [
    [
      'a request that is already pending in the wallet (-32002)',
      () => new ResourceUnavailableRpcError(new Error('pending')),
      'RPC_UNAVAILABLE',
    ],
    ['a rate limit', limited, 'RPC_RATE_LIMITED'],
    [
      'a backend failure (-32603)',
      () =>
        new RpcRequestError({
          body: { method: 'eth_sendTransaction' },
          error: { code: -32603, message: 'Internal error' },
          url: 'https://rpc.example',
        }),
      'RPC_UNAVAILABLE',
    ],
    ['an error that is not from viem', () => new Error('socket hang up'), 'UNKNOWN'],
  ];

  it.each(refusals)('asks the wallet once after %s', async (_name, error, code) => {
    const { wallet, calls } = fakeWallet(async () => {
      throw error();
    });
    await expect(sendPlan(fakeCtx().ctx, planOf(step(), step()), wallet)).rejects.toMatchObject({
      code,
      details: { index: 0, completed: 0 },
    });
    expect(calls).toHaveLength(1);
  });

  it('reports a rejection in the wallet as USER_REJECTED with the step it happened at', async () => {
    const { wallet, calls } = fakeWallet(async (_a, n) => {
      if (n === 2) throw new UserRejectedRequestError(new Error('User denied transaction signature'));
      return HASH;
    });
    await expect(sendPlan(fakeCtx().ctx, planOf(step(), step(), step()), wallet)).rejects.toMatchObject({
      code: 'USER_REJECTED',
      details: { index: 1, completed: 1 },
    });
    expect(calls).toHaveLength(2);
  });
});

describe('sendPlan after the wallet has signed', () => {
  it('keeps the hash when the receipt cannot be read, so the step is not sent again', async () => {
    const { wallet } = fakeWallet();
    const { ctx } = fakeCtx({
      receipt: async () => {
        throw limited();
      },
    });
    const failed = await sendPlan(ctx, planOf(step()), wallet).catch((e) => e);
    expect(failed).toMatchObject({ code: 'RPC_RATE_LIMITED', details: { hash: HASH, index: 0, completed: 0 } });
    expect(failed.message).toContain(HASH);
  });

  it('reports a step that reverted on chain with its hash', async () => {
    const { wallet, calls } = fakeWallet();
    const { ctx } = fakeCtx({ receipt: async () => ({ ...RECEIPT, status: 'reverted' }) });
    await expect(sendPlan(ctx, planOf(step(), step()), wallet)).rejects.toMatchObject({
      code: 'UNKNOWN',
      details: { hash: HASH, index: 0, completed: 0 },
    });
    expect(calls).toHaveLength(1);
  });

  it('reports each phase in order and returns the receipts', async () => {
    const { wallet } = fakeWallet();
    const seen: string[] = [];
    const r = await sendPlan(fakeCtx().ctx, planOf(step(), step({ action: 'poke' })), wallet, {
      onStep: (e) => seen.push(`${e.index}/${e.total}:${e.phase}:${e.hash ? 'hash' : '-'}`),
    });
    expect(seen).toEqual([
      '0/2:signing:-',
      '0/2:pending:hash',
      '0/2:confirmed:hash',
      '1/2:signing:-',
      '1/2:pending:hash',
      '1/2:confirmed:hash',
    ]);
    expect(r.vault).toBe(VAULT);
    expect(r.steps.map((s) => [s.index, s.action, s.hash, s.blockNumber, s.gasUsed, s.events])).toEqual([
      [0, 'checkIn', HASH, 7n, 50_000n, []],
      [1, 'poke', HASH, 7n, 50_000n, []],
    ]);
  });
});
