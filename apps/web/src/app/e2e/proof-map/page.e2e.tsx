'use client';

import { useEffect, useState } from 'react';
import { useLocationHash } from '@/lib/hash';
import { comboBitsOf, PROOF_BLOCKS } from '@/proof/paint';
import { ProofCanvas } from '@/proof/proof-canvas';

const BITS = comboBitsOf(PROOF_BLOCKS);
/** The worker reports every 4096 blocks (Task 1), and its 100 ms throttle drops some reports: uneven steps. */
const TICK = 4096;
const STRIDES = [1, 3, 2, 5, 1, 4] as const;

type Mode = { kind: 'at' | 'run'; blocks: number };

/** `#at=<blocks>` holds both maps at that count; `#run=<blocks>` steps the first one there, one report a frame. */
function parseMode(hash: string): Mode | null {
  const q = new URLSearchParams(hash.slice(1));
  for (const kind of ['at', 'run'] as const) {
    const raw = q.get(kind);
    const n = raw ? Number(raw) : Number.NaN;
    if (Number.isInteger(n) && n >= 0) return { kind, blocks: Math.min(n, PROOF_BLOCKS) };
  }
  return null;
}

/** Blocks done of a run to `to`, a stride of reports per animation frame; 0 without a run. */
function useRun(to: number | null): number {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (to === null) return;
    let blocks = 0;
    let i = 0;
    let frame = 0;
    const step = () => {
      blocks = Math.min(to, blocks + TICK * STRIDES[i % STRIDES.length]);
      i += 1;
      setDone(blocks);
      if (blocks < to) frame = requestAnimationFrame(step);
    };
    setDone(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return done;
}

/**
 * Only in builds with ATROPYLE_E2E=1 (next.config.mjs pageExtensions). test/e2e/proof-map.spec.ts compares the
 * map painted tick by tick with the same count painted in one go, in a real canvas, in both themes.
 */
export default function ProofMapHarness() {
  const mode = parseMode(useLocationHash());
  const ran = useRun(mode?.kind === 'run' ? mode.blocks : null);
  const target = mode?.blocks ?? 0;
  const live = mode?.kind === 'run' ? ran : target;
  const finished = live === target;
  // 'idle' without a hash: the prerendered page and the first hydration render (the hash is '' there) have no run, so
  // they are never 'done', and a test that waits for 'done' waits for the run.
  const runState = mode === null ? 'idle' : finished ? 'done' : 'running';
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1">Proof map</h1>
        <p data-testid="proof-run" data-state={runState} className="text-ink-muted tabular-nums">
          {live.toLocaleString('en-US')} of {PROOF_BLOCKS.toLocaleString('en-US')} blocks
        </p>
      </header>
      <div className="grid gap-8 md:grid-cols-2">
        <figure data-testid="live-map" className="flex flex-col gap-3">
          <ProofCanvas comboBits={BITS} doneBlocks={live} label="Proof map, painted tick by tick" />
          <figcaption className="text-ink-muted text-small">Painted tick by tick</figcaption>
        </figure>
        <figure data-testid="fresh-map" className="flex flex-col gap-3">
          {finished ? (
            <ProofCanvas comboBits={BITS} doneBlocks={target} label="Proof map, painted in one go" />
          ) : (
            <div className="aspect-square w-full rounded-2xl border border-line border-dashed" />
          )}
          <figcaption className="text-ink-muted text-small">Painted in one go</figcaption>
        </figure>
      </div>
    </section>
  );
}
