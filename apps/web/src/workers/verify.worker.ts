import { decodeError } from '@atropyle/sdk';
import { evaluatePolicyBundle } from '@atropyle/sdk/verify';
import type { WorkerIn, WorkerOut } from '../verify/impl/verify-client';

// Compute only (Plan 4, decision 8): this file makes no network request. Typed by hand because the WebWorker lib
// clashes with the DOM lib of this project.
const scope = self as unknown as {
  postMessage(m: WorkerOut): void;
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
};

scope.onmessage = async (e) => {
  if (e.data?.type !== 'evaluate') return;
  let last = 0;
  try {
    const result = await evaluatePolicyBundle(e.data.bundle, {
      blocks: e.data.blocks,
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
