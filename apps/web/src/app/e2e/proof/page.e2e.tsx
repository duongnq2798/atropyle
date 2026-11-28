'use client';

import type { PolicyVerification } from '@atropyle/sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocationHash } from '@/lib/hash';
import { PROOF_BLOCKS } from '@/proof/paint';
import { ProofView } from '@/proof/proof-view';
import { blocksOf, type ProofRun } from '@/proof/use-proof-run';
import { evaluateInWorker } from '../../../verify/impl/verify-client';
import { type HarnessOptions, harnessBundle } from './bundle';

interface Mode extends Required<HarnessOptions> {
  blocks: number;
  auto: boolean;
}

/**
 * `#auto&blocks=4096&lie&nop9&rpcs=1`: start at once (a screenshot reloads the page), fewer blocks, a lying operator,
 * no P9, one operator. No hash: an idle page, as the prerender is.
 */
function parseMode(hash: string): Mode {
  const q = new URLSearchParams(hash.slice(1));
  const raw = Number(q.get('blocks'));
  const blocks = Number.isInteger(raw) && raw >= 1 && raw <= PROOF_BLOCKS ? raw : PROOF_BLOCKS;
  return { blocks, auto: q.has('auto'), lie: q.has('lie'), noP9: q.has('nop9'), rpcs: q.get('rpcs') === '1' ? 1 : 2 };
}

type RunState = Pick<ProofRun, 'status' | 'doneBlocks' | 'result' | 'error'>;
const IDLE: RunState = { status: 'idle', doneBlocks: 0, result: undefined, error: undefined };

/** The page's run, on the mainnet bundle, through the production worker and client (evaluateInWorker). */
function useHarnessRun(mode: Mode): ProofRun {
  const [state, setState] = useState<RunState>(IDLE);
  const [runs, setRuns] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const { blocks, lie, noP9, rpcs } = mode;
  const go = useCallback(
    (fresh: boolean) => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      const live = () => ctrl.current === c && !c.signal.aborted;
      if (fresh) setRuns((n) => n + 1);
      setState({ ...IDLE, status: 'loading' });
      evaluateInWorker(harnessBundle({ lie, noP9, rpcs }), {
        blocks,
        signal: c.signal,
        onProgress: (done) => {
          if (live()) setState({ ...IDLE, status: 'running', doneBlocks: done });
        },
      }).then(
        (result: PolicyVerification) => {
          if (live()) setState({ status: 'done', doneBlocks: blocksOf(result), result, error: undefined });
        },
        (error: unknown) => {
          if (live()) setState({ ...IDLE, status: 'error', error });
        },
      );
    },
    [blocks, lie, noP9, rpcs],
  );
  useEffect(() => () => ctrl.current?.abort(), []);
  const start = useCallback(() => go(false), [go]);
  const again = useCallback(() => go(true), [go]);
  return { ...state, runs, start, again, retry: start, warm: () => undefined };
}

/**
 * Only in builds with ATROPYLE_E2E=1 (next.config.mjs pageExtensions). /proof/'s own view on a mainnet-shaped bundle
 * built from this repository (bundle.ts): test/e2e/proof.spec.ts proves all 2^26 cases here in the real worker, and
 * takes the screenshots of a passed proof, which the devnet cannot give.
 */
export default function ProofHarness() {
  const hash = useLocationHash();
  const mode = useMemo(() => parseMode(hash), [hash]);
  const run = useHarnessRun(mode);
  const { start, status } = run;
  useEffect(() => {
    if (mode.auto && status === 'idle') start();
  }, [mode.auto, status, start]);
  return <ProofView run={run} />;
}
