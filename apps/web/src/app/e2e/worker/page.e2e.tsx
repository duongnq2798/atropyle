'use client';

import { useEffect, useState } from 'react';
import type { SmokeResult } from '../../../workers/smoke.worker';

type Check = SmokeResult | { state: 'running'; detail: string };

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

/** Only in builds with ATROPYLE_E2E=1 (next.config.mjs pageExtensions). Read by scripts/worker-check.ts and e2e. */
export default function WorkerSmokePage() {
  const [smoke, setSmoke] = useState<Check>({ state: 'running', detail: '' });
  useEffect(() => {
    let live = true;
    runSmoke().then((r) => {
      if (live) setSmoke(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <main>
      <h1>Worker smoke test</h1>
      <p data-testid="worker-smoke" data-state={smoke.state}>
        {smoke.detail}
      </p>
    </main>
  );
}
