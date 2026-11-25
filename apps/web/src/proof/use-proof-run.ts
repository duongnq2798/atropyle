'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sdkQuery } from '@/chain/hooks';
import { useChainSettings } from '@/chain/provider';
import { useProof } from '@/verify/hooks';
import { loadVerifyImpl } from '@/verify/load';
import type { PolicyVerification } from '@/verify/types';
import { PROOF_BLOCKS } from './paint';

/** 'loading' reads the SDK, the circuit and the P9 answers; 'running' is the enumeration, which the map counts. */
export type ProofRunStatus = 'idle' | 'loading' | 'running' | 'done' | 'error';

export interface ProofRun {
  status: ProofRunStatus;
  /** Blocks of 32 cases done in the run on screen; what a finished result covers once done. */
  doneBlocks: number;
  result: PolicyVerification | undefined;
  error: unknown;
  /** Runs started on this page with again(): 0 while the page shows the session proof. */
  runs: number;
  /** The session proof (useProof), which /verify/ joins or reuses. */
  start(): void;
  /** A fresh run of every block with a new P9 seed; it stops the fresh run before it. */
  again(): void;
  /** After an error: the run that failed, again. */
  retry(): void;
  /** Loads the SDK and the proof code ahead of a press (pointer over or focus on the button). */
  warm(): void;
}

interface Fresh {
  status: 'loading' | 'running' | 'done' | 'error';
  done: number;
  result?: PolicyVerification;
  error?: unknown;
}

/** Blocks a finished result covers: a proof that could not enumerate (combos 0) shows an empty map. */
export function blocksOf(result: PolicyVerification): number {
  return Math.min(PROOF_BLOCKS, Math.floor(result.combos / 32));
}

/**
 * The run /proof/ shows. The first is the session proof of 7A (useProof), kept for the session and shared with
 * /verify/. "Run again" is a fresh run of every block with its own AbortController (ruling R14): runProof never caches
 * it, so it draws a new P9 seed, and its worker stops when the reader leaves the page or presses again. A signal goes
 * only with `blocks`, never on the session proof (7A parked note).
 */
export function useProofRun(): ProofRun {
  const session = useProof();
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [runs, setRuns] = useState(0);
  const ctrl = useRef<AbortController | null>(null);

  // Leaving the page stops a fresh run's worker. The session proof runs on: a vault page may be waiting for it.
  useEffect(() => () => ctrl.current?.abort(), []);

  const again = useCallback(() => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const live = () => ctrl.current === c && !c.signal.aborted;
    setRuns((n) => n + 1);
    setFresh({ status: 'loading', done: 0 });
    void (async () => {
      try {
        const sdk = await client.query(sdkQuery(crossCheck));
        const impl = await loadVerifyImpl();
        const result = await impl.runProof(sdk, {
          blocks: PROOF_BLOCKS,
          signal: c.signal,
          onProgress: (done) => {
            if (live()) setFresh({ status: 'running', done });
          },
        });
        if (live()) setFresh({ status: 'done', done: blocksOf(result), result });
      } catch (error) {
        if (live()) setFresh({ status: 'error', done: 0, error });
      }
    })();
  }, [client, crossCheck]);

  const { run: start } = session;
  const retry = useCallback(() => {
    if (fresh) again();
    else start();
  }, [fresh, again, start]);

  const warm = useCallback(() => {
    void client.prefetchQuery(sdkQuery(crossCheck));
    loadVerifyImpl().catch(() => undefined);
  }, [client, crossCheck]);

  if (fresh) {
    return {
      status: fresh.status,
      doneBlocks: fresh.done,
      result: fresh.result,
      error: fresh.error,
      runs,
      start,
      again,
      retry,
      warm,
    };
  }
  const status: ProofRunStatus =
    session.status === 'running' ? (session.progress ? 'running' : 'loading') : session.status;
  const doneBlocks = session.result ? blocksOf(session.result) : (session.progress?.done ?? 0);
  return { status, doneBlocks, result: session.result, error: session.error, runs, start, again, retry, warm };
}
