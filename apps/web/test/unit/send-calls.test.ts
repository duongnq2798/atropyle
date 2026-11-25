import type { SendCallsParams } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import {
  CallsUnsupported,
  normalizeStatus,
  readCallsStatus,
  sendCalls,
  supportsSendCalls,
} from '../../src/wallet/impl/send-calls';
import type { Eip1193 } from '../../src/wallet/impl/wallet';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const H1 = `0x${'01'.repeat(32)}` as const;
const PARAMS: SendCallsParams = {
  version: '2.0.0',
  chainId: '0xc4',
  from: A,
  atomicRequired: false,
  calls: [{ to: A, data: '0x', value: '0x0' }],
};
const noSleep = async () => {};

function wallet(handlers: Record<string, (params: unknown) => unknown>) {
  const calls: string[] = [];
  const p: Eip1193 = {
    async request({ method, params }) {
      calls.push(method);
      const h = handlers[method];
      if (!h) throw Object.assign(new Error('Method not found'), { code: -32601 });
      return h(params);
    },
  };
  return { p, calls };
}

describe('EIP-5792', () => {
  it('detects support through wallet_getCapabilities', async () => {
    const yes = wallet({ wallet_getCapabilities: () => ({ '0xc4': { atomic: { status: 'supported' } } }) });
    expect(await supportsSendCalls(yes.p, A, 196)).toBe(true);
    expect(await supportsSendCalls(wallet({}).p, A, 196)).toBe(false);
  });

  it('needs capabilities for the requested chain', async () => {
    const empty = wallet({ wallet_getCapabilities: () => ({}) });
    expect(await supportsSendCalls(empty.p, A, 196)).toBe(false);
    const other = wallet({ wallet_getCapabilities: () => ({ '0x1': { atomic: { status: 'supported' } } }) });
    expect(await supportsSendCalls(other.p, A, 196)).toBe(false);
    const nul = wallet({ wallet_getCapabilities: () => ({ '0xc4': null }) });
    expect(await supportsSendCalls(nul.p, A, 196)).toBe(false);
  });

  it('polls wallet_getCallsStatus until the bundle is confirmed', async () => {
    let polls = 0;
    const seen: string[] = [];
    const w = wallet({
      wallet_sendCalls: () => ({ id: 'bundle-1' }),
      wallet_getCallsStatus: () =>
        ++polls < 3 ? { status: 100 } : { status: 200, receipts: [{ transactionHash: H1, status: '0x1' }] },
    });
    const r = await sendCalls(w.p, PARAMS, { sleep: noSleep, onStatus: (s) => seen.push(s) });
    expect(r).toEqual({ id: 'bundle-1', status: 'confirmed', hashes: [H1], ok: true });
    expect(seen).toEqual(['pending', 'pending', 'confirmed']);
  });

  it('throws CallsUnsupported when the wallet cannot batch', async () => {
    const w = wallet({ wallet_sendCalls: () => Promise.reject(Object.assign(new Error('no'), { code: 5700 })) });
    await expect(sendCalls(w.p, PARAMS, { sleep: noSleep })).rejects.toBeInstanceOf(CallsUnsupported);
    await expect(sendCalls(wallet({}).p, PARAMS, { sleep: noSleep })).rejects.toBeInstanceOf(CallsUnsupported);
  });

  it('accepts the string id and string statuses of older wallets', async () => {
    const w = wallet({
      wallet_sendCalls: () => '0xabc',
      wallet_getCallsStatus: () => ({ status: 'CONFIRMED', receipts: [{ transactionHash: H1, status: '0x1' }] }),
    });
    expect(await sendCalls(w.p, PARAMS, { sleep: noSleep })).toMatchObject({
      id: '0xabc',
      status: 'confirmed',
      ok: true,
    });
    expect(normalizeStatus('PENDING')).toBe('pending');
    expect(normalizeStatus(600)).toBe('partial');
  });

  it('reports a reverted call as not ok', async () => {
    const reverted = wallet({
      wallet_sendCalls: () => ({ id: 'b' }),
      wallet_getCallsStatus: () => ({ status: 200, receipts: [{ transactionHash: H1, status: '0x0' }] }),
    });
    expect(await sendCalls(reverted.p, PARAMS, { sleep: noSleep })).toMatchObject({ ok: false, hashes: [H1] });
    const failed = wallet({ wallet_sendCalls: () => ({ id: 'b' }), wallet_getCallsStatus: () => ({ status: 500 }) });
    expect(await sendCalls(failed.p, PARAMS, { sleep: noSleep })).toMatchObject({ status: 'reverted', ok: false });
  });

  it('stops polling at the timeout', async () => {
    const w = wallet({ wallet_sendCalls: () => ({ id: 'b' }), wallet_getCallsStatus: () => ({ status: 100 }) });
    expect(await sendCalls(w.p, PARAMS, { sleep: noSleep, timeoutMs: 0 })).toEqual({
      id: 'b',
      status: 'pending',
      hashes: [],
      ok: false,
    });
  });

  it('keeps polling when a status poll throws, then reports the bundle', async () => {
    let n = 0;
    const w = wallet({
      wallet_sendCalls: () => ({ id: 'b' }),
      wallet_getCallsStatus: () => {
        if (++n === 1) throw new Error('rpc down');
        return { status: 200, receipts: [{ transactionHash: H1, status: '0x1' }] };
      },
    });
    expect(await sendCalls(w.p, PARAMS, { sleep: noSleep })).toMatchObject({ id: 'b', status: 'confirmed', ok: true });
    expect(n).toBe(2);
  });

  it('returns pending with the bundle id when every poll throws until the deadline', async () => {
    const w = wallet({
      wallet_sendCalls: () => ({ id: 'b' }),
      wallet_getCallsStatus: () => {
        throw new Error('rpc down');
      },
    });
    expect(await sendCalls(w.p, PARAMS, { sleep: noSleep, timeoutMs: 0 })).toEqual({
      id: 'b',
      status: 'pending',
      hashes: [],
      ok: false,
    });
  });

  it('tells 400, 500, 600 and unknown statuses apart', () => {
    expect(normalizeStatus(400)).toBe('failed');
    expect(normalizeStatus(500)).toBe('reverted');
    expect(normalizeStatus(600)).toBe('partial');
    expect(normalizeStatus(777)).toBe('unknown');
    expect(normalizeStatus(undefined)).toBe('unknown');
  });

  it('reads one status poll; a poll that throws reads as pending', async () => {
    const ok = wallet({ wallet_getCallsStatus: () => ({ status: 200, receipts: [{ transactionHash: H1 }] }) });
    expect(await readCallsStatus(ok.p, 'b1')).toEqual({ id: 'b1', status: 'confirmed', hashes: [H1], ok: true });
    const down = wallet({
      wallet_getCallsStatus: () => {
        throw new Error('offline');
      },
    });
    expect(await readCallsStatus(down.p, 'b1')).toEqual({ id: 'b1', status: 'pending', hashes: [], ok: false });
  });

  it('drops what the wallet reports as a hash when it is not 32 bytes of hex', async () => {
    const w = wallet({
      wallet_getCallsStatus: () => ({
        status: 500,
        receipts: [{ transactionHash: 'see https://x' }, { transactionHash: H1 }, 'nonsense'],
      }),
    });
    expect((await readCallsStatus(w.p, 'b1')).hashes).toEqual([H1]);
  });
});
