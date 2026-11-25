import { AtropyleError, type PolicyVerification } from '@atropyle/sdk';
import type { PolicyBundle } from '@atropyle/sdk/verify';
import { describe, expect, it } from 'vitest';
import {
  evaluateInWorker,
  proofKey,
  quorumClient,
  type WorkerIn,
  type WorkerLike,
  type WorkerOut,
} from '../../src/lib/verify-client';
import { fixtureDeployment } from './fixtures';

function fakeWorker(
  reply: (m: WorkerIn, send: (o: WorkerOut) => void) => void,
  crash: { message?: string } | null = null,
) {
  const seen: WorkerIn[] = [];
  let terminated = false;
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(m) {
      seen.push(m);
      queueMicrotask(() => {
        if (crash) w.onerror?.(crash);
        else reply(m, (o) => w.onmessage?.({ data: o }));
      });
    },
    terminate() {
      terminated = true;
    },
  };
  return { factory: () => w, seen, terminated: () => terminated };
}

const bundle = { chainId: 196 } as unknown as PolicyBundle;
const result = { ok: true, combos: 4 } as unknown as PolicyVerification;

describe('evaluateInWorker', () => {
  it('forwards progress and resolves with the result', async () => {
    const w = fakeWorker((_m, send) => {
      send({ type: 'progress', done: 2, total: 4 });
      send({ type: 'result', result });
    });
    const progress: [number, number][] = [];
    const r = await evaluateInWorker(bundle, {
      worker: w.factory,
      blocks: 4,
      onProgress: (d, t) => progress.push([d, t]),
    });
    expect(r).toBe(result);
    expect(progress).toEqual([[2, 4]]);
    expect(w.seen).toEqual([{ type: 'evaluate', bundle, blocks: 4 }]);
    expect(w.terminated()).toBe(true);
  });

  it('rebuilds the SDK error sent by the worker', async () => {
    const error = new AtropyleError('POLICY_UNAVAILABLE').toJSON();
    const w = fakeWorker((_m, send) => send({ type: 'error', error }));
    const p = evaluateInWorker(bundle, { worker: w.factory });
    await expect(p).rejects.toBeInstanceOf(AtropyleError);
    await expect(p).rejects.toMatchObject({ code: 'POLICY_UNAVAILABLE' });
  });

  it('rejects when the worker crashes', async () => {
    const w = fakeWorker(() => {}, { message: 'boom' });
    await expect(evaluateInWorker(bundle, { worker: w.factory })).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'The proof worker stopped: boom',
    });
    expect(w.terminated()).toBe(true);
  });

  it('names a worker that failed to load, whose error event has no message', async () => {
    const w = fakeWorker(() => {}, {});
    await expect(evaluateInWorker(bundle, { worker: w.factory })).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'The proof worker stopped: the proof worker failed to load',
    });
  });
});

describe('quorumClient', () => {
  it('never follows CCIP-Read and never caches the block number', async () => {
    const rpc = { read: [], verify: [['https://a.example'], ['https://b.example']], crossCheck: true, offchain: [] };
    const { client, rpcs } = await quorumClient({ atro: { chain: { id: 196, name: 'X Layer' } }, rpc } as never);
    expect(rpcs).toBe(2);
    expect(client.cacheTime).toBe(0);
    expect(client.ccipRead).toBe(false);
  });
});

describe('proofKey', () => {
  it('depends on the factory and on the operator groups', () => {
    const d = fixtureDeployment();
    const one = proofKey({
      deployment: d,
      rpc: { read: [], verify: [['https://a']], crossCheck: false, offchain: [] },
    });
    const two = proofKey({
      deployment: d,
      rpc: { read: [], verify: [['https://a'], ['https://b']], crossCheck: true, offchain: [] },
    });
    expect(one).not.toBe(two);
    expect(one).toContain(d.factory.toLowerCase());
  });
});
