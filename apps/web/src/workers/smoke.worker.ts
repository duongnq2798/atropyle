import { evaluatePolicyBundle, type PolicyBundle } from '@atropyle/sdk/verify';

export type SmokeResult = { state: 'ok' | 'error'; detail: string };

// Typed by hand: the WebWorker lib clashes with the DOM lib of this project.
const scope = self as unknown as {
  postMessage(m: SmokeResult): void;
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
};

/** A bundle without the policy netlist: the SDK must refuse it with POLICY_UNAVAILABLE, before any enumeration. */
const EMPTY = {
  cpu: '0x0000000000000000000000000000000000000000',
  policyId: 0n,
  netlists: [],
} as unknown as PolicyBundle;

/**
 * Plan 7A Quyết định 3 and 19: the worker chunk loads under `worker-src 'self'`, runs SDK verify code and loads a
 * lazy chunk of its own.
 */
scope.onmessage = async () => {
  let mark: string;
  try {
    mark = (await import('./smoke-lazy')).MARK;
  } catch (e) {
    scope.postMessage({ state: 'error', detail: `lazy chunk failed: ${String(e)}` });
    return;
  }
  try {
    await evaluatePolicyBundle(EMPTY);
    scope.postMessage({ state: 'error', detail: 'a bundle without a policy was accepted' });
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    scope.postMessage(
      code === 'POLICY_UNAVAILABLE'
        ? { state: 'ok', detail: `${mark}; the SDK refused the bundle with ${code}` }
        : { state: 'error', detail: `unexpected error: ${String(e)}` },
    );
  }
};
