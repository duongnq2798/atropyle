import { AtropyleError, type PolicyVerification } from '@atropyle/sdk';
import type { PolicyBundle } from '@atropyle/sdk/verify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sdk } from '../../src/lib/sdk';
import {
  evaluateInWorker,
  runProof,
  runVaultVerify,
  type WorkerIn,
  type WorkerLike,
  type WorkerOut,
} from '../../src/lib/verify-client';
import { fixtureDeployment } from './fixtures';

const mocks = vi.hoisted(() => ({
  readPolicyBundle: vi.fn(),
  verifyVault: vi.fn(),
}));

vi.mock('@atropyle/sdk/verify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@atropyle/sdk/verify')>()),
  readPolicyBundle: mocks.readPolicyBundle,
  verifyVault: mocks.verifyVault,
}));

const bundle = { chainId: 196 } as unknown as PolicyBundle;
const proof = { ok: true, combos: 4 } as unknown as PolicyVerification;
const VAULT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

let n = 0;
/** A fresh factory address per test gives each test its own cache key. */
function sdkOf(): Sdk {
  n += 1;
  const deployment = fixtureDeployment({ factory: `0x${n.toString(16).padStart(40, '0')}` });
  const rpc = { read: [], verify: [['https://a.example'], ['https://b.example']], crossCheck: true, offchain: [] };
  return { atro: { chain: { id: 196, name: 'X Layer' } }, deployment, rpc } as unknown as Sdk;
}

/** A worker the test drives by hand. */
function manualWorker() {
  const started: WorkerLike[] = [];
  const factory = () => {
    const w: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage: (_m: WorkerIn) => {},
      terminate: () => {},
    };
    started.push(w);
    return w;
  };
  const send = (i: number, o: WorkerOut) => started[i]?.onmessage?.({ data: o });
  return { factory, started, send };
}

/** The proof starts after dynamic imports, so wait for the worker instead of one tick. */
const started = (w: { started: unknown[] }, count: number) =>
  vi.waitFor(() => expect(w.started.length).toBeGreaterThanOrEqual(count));

beforeEach(() => {
  mocks.readPolicyBundle.mockReset().mockResolvedValue(bundle);
  mocks.verifyVault.mockReset();
});

describe('runProof cache', () => {
  it('starts the worker once for two calls with the same key', async () => {
    const sdk = sdkOf();
    const w = manualWorker();
    const a = runProof(sdk, { worker: w.factory });
    const b = runProof(sdk, { worker: w.factory });
    await started(w, 1);
    w.send(0, { type: 'result', result: proof });
    expect(await a).toBe(proof);
    expect(await b).toBe(proof);
    expect(w.started).toHaveLength(1);
    expect(mocks.readPolicyBundle).toHaveBeenCalledTimes(1);
    expect(await runProof(sdk, { worker: w.factory })).toBe(proof);
    expect(w.started).toHaveLength(1);
  });

  it('runs again after a failed proof', async () => {
    const sdk = sdkOf();
    const w = manualWorker();
    const first = runProof(sdk, { worker: w.factory });
    await started(w, 1);
    w.send(0, { type: 'error', error: new AtropyleError('POLICY_UNAVAILABLE').toJSON() });
    await expect(first).rejects.toMatchObject({ code: 'POLICY_UNAVAILABLE' });
    const second = runProof(sdk, { worker: w.factory });
    await started(w, 2);
    expect(w.started).toHaveLength(2);
    w.send(1, { type: 'result', result: proof });
    expect(await second).toBe(proof);
  });

  it('bypasses the cache when blocks is set', async () => {
    const sdk = sdkOf();
    const w = manualWorker();
    // Two bounded runs, then a full one: none of them may reuse or fill the cache.
    for (const [i, blocks] of [
      [0, 2],
      [1, 2],
      [2, undefined],
    ] as const) {
      const p = runProof(sdk, { worker: w.factory, blocks });
      await started(w, i + 1);
      expect(w.started).toHaveLength(i + 1);
      w.send(i, { type: 'result', result: proof });
      await p;
    }
    expect(mocks.readPolicyBundle).toHaveBeenCalledTimes(3);
    // The full run is now cached.
    await runProof(sdk, { worker: w.factory });
    expect(w.started).toHaveLength(3);
  });

  it('gives a caller that joins a proof in flight its progress', async () => {
    const sdk = sdkOf();
    const w = manualWorker();
    const first: [number, number][] = [];
    const late: [number, number][] = [];
    const a = runProof(sdk, { worker: w.factory, onProgress: (d, t) => first.push([d, t]) });
    await started(w, 1);
    w.send(0, { type: 'progress', done: 1, total: 4 });
    const b = runProof(sdk, { worker: w.factory, onProgress: (d, t) => late.push([d, t]) });
    expect(late).toEqual([[1, 4]]);
    w.send(0, { type: 'progress', done: 2, total: 4 });
    w.send(0, { type: 'result', result: proof });
    await Promise.all([a, b]);
    const both = [
      [1, 4],
      [2, 4],
    ];
    expect(first).toEqual(both);
    expect(late).toEqual(both);
    expect(w.started).toHaveLength(1);
  });
});

describe('runVaultVerify', () => {
  it('hands the cached proof to verifyVault', async () => {
    const sdk = sdkOf();
    const w = manualWorker();
    const cached = runProof(sdk, { worker: w.factory });
    await started(w, 1);
    w.send(0, { type: 'result', result: proof });
    await cached;
    mocks.verifyVault.mockImplementation(async (_c, _v, rpcs, policy) => ({ rpcs, got: await policy() }));
    const r = await runVaultVerify(sdk, VAULT, { policy: true, worker: w.factory });
    expect(r).toEqual({ rpcs: 2, got: proof });
    expect(w.started).toHaveLength(1);
  });

  it('passes no policy for the cheap pass', async () => {
    mocks.verifyVault.mockResolvedValue({});
    await runVaultVerify(sdkOf(), VAULT, { policy: false });
    expect(mocks.verifyVault.mock.calls[0]?.[3]).toBeNull();
  });
});

describe('evaluateInWorker start failure', () => {
  it('terminates the worker when postMessage throws', async () => {
    let terminated = false;
    const w: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage() {
        throw new Error('DataCloneError');
      },
      terminate() {
        terminated = true;
      },
    };
    await expect(evaluateInWorker(bundle, { worker: () => w })).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(terminated).toBe(true);
  });
});
