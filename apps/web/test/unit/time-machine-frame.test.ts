import { DRILL_LIFETIME_SECONDS, evalStateOf, modelEngine } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { type ScenarioRun, scenarios } from '../../src/flows/impl/time-machine';
import {
  clampOffset,
  frameIndex,
  momentOffsets,
  nextOffset,
  prevOffset,
  scrubAxis,
  threadFrame,
} from '../../src/flows/time-machine/frame';
import { courseX, drawnAxis, GATE_MAX_X } from '../../src/thread/geometry';
import { fixtureSnapshot } from './fixtures';

const s = evalStateOf(fixtureSnapshot());
const END = 1_000n + BigInt(DRILL_LIFETIME_SECONDS);
const runs = scenarios(modelEngine(), s, 1_000n, END, true);
function run(id: ScenarioRun['id']): ScenarioRun {
  const r = runs.find((x) => x.id === id);
  if (!r) throw new Error(`no ${id} scenario`);
  return r;
}

describe('scrubber axis', () => {
  it('runs from now to the end of the drawn axis, in about 200 steps', () => {
    expect(scrubAxis(run('silent'))).toEqual({ from: 1_000n, to: 2_068n, span: 1_068, step: 5, release: 1_890n });
    expect(scrubAxis(run('confirm'))).toMatchObject({ to: 1_290n, span: 290, step: 1, release: 1_230n });
    expect(scrubAxis(run('returns'))).toMatchObject({ to: 2_284n, span: 1_284, step: 6, release: 2_070n });
  });

  it('keeps one scale through every frame: no gate stands past GATE_MAX_X, so drawnAxis never stretches a frame', () => {
    for (const r of runs) {
      const axis = scrubAxis(r);
      r.moments.forEach((m, i) => {
        const f = threadFrame(r, axis, i, m.at, END);
        expect(drawnAxis(f.axis).to).toBe(axis.to);
        expect(courseX(f.axis.releaseAt ?? axis.from, f.axis)).toBeLessThanOrEqual(GATE_MAX_X);
      });
    }
  });
});

describe('frames', () => {
  it('a time belongs to the latest moment at or before it', () => {
    const silent = run('silent');
    expect(frameIndex(silent, 999n)).toBe(0);
    expect(frameIndex(silent, 1_109n)).toBe(0);
    expect(frameIndex(silent, 1_110n)).toBe(1);
    expect(frameIndex(silent, 99_999n)).toBe(2);
  });

  it("draws each frame's outlook, capped by the story's own release", () => {
    const confirm = run('confirm');
    // Now, silence would release at 1 890; this story releases at 1 230, and its gate stands there.
    expect(threadFrame(confirm, scrubAxis(confirm), 0, 1_000n, END).axis.releaseAt).toBe(1_230n);
    const returns = run('returns');
    const back = threadFrame(returns, scrubAxis(returns), 4, 1_170n, END);
    expect(back.state).toBe('active');
    expect(back.axis).toMatchObject({ from: 1_000n, to: 2_284n, now: 1_170n, alarmAt: 1_290n, releaseAt: 2_070n });
    expect(back.axis.marks).toEqual([1_170n]);
    expect(threadFrame(returns, scrubAxis(returns), 3, 1_112n, END).axis.marks).toEqual([]);
    expect(threadFrame(run('silent'), scrubAxis(run('silent')), 2, END, END).state).toBe('expired');
  });

  it('Page Up and Page Down land on the next and previous moments', () => {
    const o = momentOffsets(run('silent'));
    expect(o).toEqual([0, 110, 890]);
    expect(nextOffset(o, 0)).toBe(110);
    expect(nextOffset(o, 110)).toBe(890);
    expect(nextOffset(o, 890)).toBeNull();
    expect(prevOffset(o, 890)).toBe(110);
    expect(prevOffset(o, 500)).toBe(110);
    expect(prevOffset(o, 0)).toBeNull();
  });

  it('clamps an offset to the slider', () => {
    expect(clampOffset(-5, 100)).toBe(0);
    expect(clampOffset(150, 100)).toBe(100);
    expect(clampOffset(12.6, 100)).toBe(13);
  });
});
