import type { PolicyBundle, VerifyPolicyOptions } from '@atropyle/sdk/verify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WorkerIn, WorkerOut } from '../../src/verify/impl/verify-client';

const mocks = vi.hoisted(() => ({ evaluatePolicyBundle: vi.fn() }));

// No proof runs here: the SDK call is replaced, so the test sees exactly what the worker asks the SDK for.
vi.mock('@atropyle/sdk/verify', () => ({ evaluatePolicyBundle: mocks.evaluatePolicyBundle }));

const posted: WorkerOut[] = [];
/** Stands in for the worker's global scope: verify.worker.ts reads `self` once, when it loads. */
const scope = {
  postMessage: (m: WorkerOut) => {
    posted.push(m);
  },
  onmessage: null as ((e: { data: WorkerIn }) => unknown) | null,
};
const bundle = { chainId: 196 } as unknown as PolicyBundle;

beforeAll(async () => {
  vi.stubGlobal('self', scope);
  await import('../../src/workers/verify.worker');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('verify.worker', () => {
  it('asks the SDK for a tick every 4096 blocks and always posts the last one', async () => {
    mocks.evaluatePolicyBundle.mockImplementation(async (_b: PolicyBundle, o: VerifyPolicyOptions) => {
      for (const done of [4096, 8192, 10_000]) o.onProgress?.(done, 10_000);
      return { ok: true };
    });
    // Date.now() stands still: the 100 ms throttle lets the first tick through and drops the second; the last one
    // passes because done === total.
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      await scope.onmessage?.({ data: { type: 'evaluate', bundle, blocks: 10_000 } });
    } finally {
      vi.useRealTimers();
    }
    expect(mocks.evaluatePolicyBundle).toHaveBeenCalledTimes(1);
    expect(mocks.evaluatePolicyBundle.mock.calls[0][0]).toBe(bundle);
    expect(mocks.evaluatePolicyBundle.mock.calls[0][1]).toMatchObject({ blocks: 10_000, progressEvery: 4096 });
    expect(posted).toEqual([
      { type: 'progress', done: 4096, total: 10_000 },
      { type: 'progress', done: 10_000, total: 10_000 },
      { type: 'result', result: { ok: true } },
    ]);
  });
});
