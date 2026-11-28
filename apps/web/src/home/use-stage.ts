import { useEffect, useState } from 'react';
import { loadTimeMachine, type TimeMachineImpl } from '@/flows/time-machine/load';
import { type LazyChunk, lazyChunk } from '@/lib/lazy-chunk';
import { yieldToMain } from '@/lib/use-intent';
import type { StageRuns } from './sim-days';

export interface StageImpl {
  Scrubber: TimeMachineImpl['Scrubber'];
  /** The six stories, computed in this browser by scenarios() on the repository's netlist (impl/stage.ts). */
  runs: StageRuns;
}

/**
 * The stage's one loading path (R18.14, R18.18): the time machine through loadTimeMachine() (scenarios() with the
 * SDK, the Scrubber with Radix Slider) and impl/stage.ts with the circuits, in parallel; then a yield, and the six
 * stories, off the input's task and off React's render. Never through flows/impl/index.ts, never at mount or idle:
 * HomeStage asks for it only once useIntent says so. A failed load is forgotten, so Try again can work.
 */
export const stageChunk: LazyChunk<StageImpl> = lazyChunk(async () => {
  const [tm, stage] = await Promise.all([loadTimeMachine(), import('./impl/stage')]);
  await yieldToMain();
  return { Scrubber: tm.Scrubber, runs: stage.homeRuns(tm.scenarios) };
});

export type StagePhase = 'prerender' | 'live' | 'failed';

/**
 * The stage's chunk once `wanted`: null and `prerender` before, `live` once loaded, `failed` when the load failed
 * (retry asks again). Loaded already (a client navigation back to /): live from the first render.
 */
export function useStage(wanted: boolean): { impl: StageImpl | null; phase: StagePhase; retry(): void } {
  const [impl, setImpl] = useState<StageImpl | null>(() => stageChunk.peek());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!wanted || impl !== null || failed) return;
    let live = true;
    stageChunk.load().then(
      (v) => {
        if (live) setImpl(() => v);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [wanted, impl, failed]);
  return { impl, phase: impl !== null ? 'live' : failed ? 'failed' : 'prerender', retry: () => setFailed(false) };
}
