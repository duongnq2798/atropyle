'use client';

import type { PolicyBundle } from '@atropyle/sdk/verify';
import { useEffect, useState } from 'react';
import type { SmokeResult } from '../../../workers/smoke.worker';

type Check = SmokeResult | { state: 'running'; detail: string };

/** A bundle without the policy netlist: the SDK refuses it with POLICY_UNAVAILABLE, before any enumeration. */
const EMPTY = {
  cpu: '0x0000000000000000000000000000000000000000',
  policyId: 0n,
  netlists: [],
} as unknown as PolicyBundle;

function runSmoke(): Promise<SmokeResult> {
  return new Promise((resolve) => {
    const w = new Worker(new URL('../../../workers/smoke.worker.ts', import.meta.url), { type: 'module' });
    const done = (r: SmokeResult) => {
      w.terminate();
      resolve(r);
    };
    w.onmessage = (e: MessageEvent<SmokeResult>) => done(e.data);
    w.onerror = (e) => done({ state: 'error', detail: e.message || 'the worker failed to load' });
    w.postMessage('run');
  });
}

/** The production worker through the production client (Task 12): its chunk loads and its errors come back typed. */
async function runVerifyWorker(): Promise<SmokeResult> {
  const { evaluateInWorker } = await import('../../../verify/impl/verify-client');
  try {
    await evaluateInWorker(EMPTY);
    return { state: 'error', detail: 'a bundle without a policy was accepted' };
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    return code === 'POLICY_UNAVAILABLE'
      ? { state: 'ok', detail: `verify.worker refused the bundle with ${code}` }
      : { state: 'error', detail: `unexpected error: ${String(e)}` };
  }
}

function useCheck(run: () => Promise<SmokeResult>): Check {
  const [check, setCheck] = useState<Check>({ state: 'running', detail: '' });
  useEffect(() => {
    let live = true;
    run().then((r) => {
      if (live) setCheck(r);
    });
    return () => {
      live = false;
    };
  }, [run]);
  return check;
}

/** Only in builds with ATROPYLE_E2E=1 (next.config.mjs pageExtensions). Read by scripts/worker-check.ts and e2e. */
export default function WorkerSmokePage() {
  const smoke = useCheck(runSmoke);
  const verify = useCheck(runVerifyWorker);
  return (
    <main>
      <h1>Worker smoke test</h1>
      <p data-testid="worker-smoke" data-state={smoke.state}>
        {smoke.detail}
      </p>
      <p data-testid="worker-verify" data-state={verify.state}>
        {verify.detail}
      </p>
    </main>
  );
}
