import { decodeError } from '@atropyle/sdk';
import { evaluatePolicyBundle } from '@atropyle/sdk/verify';
import type { WorkerIn, WorkerOut } from '../verify/impl/verify-client';

// Compute only (Plan 4, decision 8): this file makes no network request. Typed by hand because the WebWorker lib
// clashes with the DOM lib of this project.
const scope = self as unknown as {
  postMessage(m: WorkerOut): void;
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
};

/**
 * Blocks between two progress ticks. 4096 blocks are 256 dots of each state on the 1024 × 1024 map of /proof/, so a
 * full run ticks 512 times; the throttle below still posts at most one tick per 100 ms, plus the last one.
 */
const PROGRESS_EVERY = 4096;

scope.onmessage = async (e) => {
  if (e.data?.type !== 'evaluate') return;
  let last = 0;
  try {
    const result = await evaluatePolicyBundle(e.data.bundle, {
      blocks: e.data.blocks,
      progressEvery: PROGRESS_EVERY,
      onProgress: (done, total) => {
        const now = Date.now();
        if (now - last >= 100 || done === total) {
          last = now;
          scope.postMessage({ type: 'progress', done, total });
        }
      },
    });
    scope.postMessage({ type: 'result', result });
  } catch (err) {
    scope.postMessage({ type: 'error', error: decodeError(err).toJSON() });
  }
};
