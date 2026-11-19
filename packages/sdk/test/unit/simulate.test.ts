import { encodeErrorResult, HttpRequestError, type PublicClient, RpcRequestError } from 'viem';
import { describe, expect, it } from 'vitest';
import { revertAbi } from '../../src/abi/index';
import { simulateTxs } from '../../src/prepare/simulate';
import { OWNER, TOKEN, VAULT } from './fixtures';

const tx = (to: typeof TOKEN) => ({ to, data: '0x01' as const, value: 0n });

function fakeClient(failing: string): PublicClient {
  return {
    simulateCalls: async () => {
      throw new Error('rpc method is not whitelisted');
    },
    estimateGas: async ({ to }: { to: string }) => {
      if (to === failing) throw new Error('execution reverted');
      return 21_000n;
    },
  } as unknown as PublicClient;
}

const limited = () => new HttpRequestError({ url: 'https://rpc.example', status: 429 });

describe('simulateTxs without eth_simulateV1', () => {
  it('estimates every step and reports later failures as skipped', async () => {
    expect(await simulateTxs(fakeClient(VAULT), OWNER, [tx(TOKEN), tx(VAULT), tx(TOKEN)])).toEqual([
      { ok: true, gas: 21_000n },
      { ok: 'skipped', reason: 'DEPENDS_ON_PREVIOUS_STEP' },
      { ok: true, gas: 21_000n },
    ]);
  });

  it('reports a failing first step as a failure', async () => {
    const [first] = await simulateTxs(fakeClient(TOKEN), OWNER, [tx(TOKEN), tx(VAULT)]);
    expect(first).toMatchObject({ ok: false, error: { code: 'UNKNOWN' } });
  });

  it('falls back when the RPC rejects the method with a JSON-RPC error, as the OKX endpoint does', async () => {
    const rejected = new RpcRequestError({
      body: { method: 'eth_simulateV1' },
      error: { code: -32601, message: 'rpc method is not whitelisted' },
      url: 'https://rpc.example',
    });
    const client = {
      simulateCalls: async () => {
        throw rejected;
      },
      estimateGas: async () => 21_000n,
    } as unknown as PublicClient;
    expect(await simulateTxs(client, OWNER, [tx(TOKEN), tx(VAULT)])).toEqual([
      { ok: true, gas: 21_000n },
      { ok: true, gas: 21_000n },
    ]);
  });
});

describe('simulateTxs with eth_simulateV1', () => {
  it('reads gas from successes and decodes the revert data of failures', async () => {
    const data = encodeErrorResult({ abi: revertAbi, errorName: 'NotOwner' });
    const client = {
      simulateCalls: async () => ({
        results: [
          { status: 'success', gasUsed: 50_000n, data: '0x' },
          { status: 'failure', gasUsed: 9_000n, data, error: new Error('reverted') },
        ],
      }),
    } as unknown as PublicClient;
    expect(await simulateTxs(client, OWNER, [tx(TOKEN), tx(VAULT)])).toEqual([
      { ok: true, gas: 50_000n },
      { ok: false, error: expect.objectContaining({ code: 'NOT_OWNER' }) },
    ]);
  });
});

describe('simulateTxs never reads a failing RPC as a failed simulation', () => {
  it('rethrows a rate limit from eth_simulateV1 instead of falling back', async () => {
    let estimates = 0;
    const client = {
      simulateCalls: async () => {
        throw limited();
      },
      estimateGas: async () => {
        estimates++;
        return 21_000n;
      },
    } as unknown as PublicClient;
    await expect(simulateTxs(client, OWNER, [tx(TOKEN), tx(VAULT)])).rejects.toMatchObject({
      code: 'RPC_RATE_LIMITED',
    });
    expect(estimates).toBe(0);
  });

  it('rethrows a rate limit from a single estimate and from the fallback estimates', async () => {
    const throttled = {
      simulateCalls: async () => {
        throw new Error('rpc method is not whitelisted');
      },
      estimateGas: async () => {
        throw limited();
      },
    } as unknown as PublicClient;
    await expect(simulateTxs(throttled, OWNER, [tx(TOKEN)])).rejects.toMatchObject({ code: 'RPC_RATE_LIMITED' });
    await expect(simulateTxs(throttled, OWNER, [tx(TOKEN), tx(VAULT)])).rejects.toMatchObject({
      code: 'RPC_RATE_LIMITED',
    });
  });
});
