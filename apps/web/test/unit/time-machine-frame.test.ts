import { DRILL_LIFETIME_SECONDS, evalStateOf, modelEngine } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { type ScenarioRun, scenarios } from '../../src/flows/impl/time-machine';
import {
  clampOffset,
  frameIndex,
  gateOf,
  momentOffsets,
  momentRings,
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

describe('rings on the thread', () => {
  it('one ring per moment after the first, merged when they touch; a check-in starts its own, as a knot', () => {
    const rings = (id: ScenarioRun['id']) =>
      momentRings(run(id), scrubAxis(run(id))).map((r) => [r.members.join(' '), r.index, r.state, r.knot]);
    expect(rings('silent')).toEqual([
      ['1', 1, 'grace', false],
      ['2', 2, 'releasedInherit', false],
    ]);
    // The alarm at 110 s and the confirmations at 111 and 112 s, on 1 284 s: one ring, in the latest one's state.
    expect(rings('returns')).toEqual([
      ['1 2 3', 3, 'grace', false],
      ['4', 4, 'active', true],
      ['5', 5, 'grace', false],
      ['6', 6, 'releasedInherit', false],
    ]);
    // The check-in one second after the votes is never merged into them.
    expect(rings('recoverBlocked')).toEqual([
      ['1 2', 2, 'recovery', false],
      ['3', 3, 'active', true],
      ['4', 4, 'grace', false],
      ['5', 5, 'releasedInherit', false],
    ]);
  });

  it('a ring stands on its latest moment, a knot on its check-in, where the Thread ties it', () => {
    const r = run('returns');
    const axis = scrubAxis(r);
    const [cluster, knot] = momentRings(r, axis);
    expect(cluster.x).toBe(courseX(r.moments[3].at, axis));
    expect(knot.x).toBe(courseX(r.moments[4].at, axis));
  });
});

describe('the gate of a frame', () => {
  it("is the frame's own release where the Thread draws a gate, or null", () => {
    const at = (id: ScenarioRun['id'], i: number) => {
      const r = run(id);
      return gateOf(r, scrubAxis(r), i, r.moments[i].at, END);
    };
    expect(at('silent', 0)).toEqual({ at: 1_890n, state: 'active' });
    expect(at('silent', 2)).toEqual({ at: 1_890n, state: 'releasedInherit' });
    expect(at('returns', 4)).toEqual({ at: 2_070n, state: 'active' });
    // The outlook releases to the heirs at 1 890, past this story: the gate drawn at its end is not that time.
    expect(at('recover', 0)).toBeNull();
    // A recovery draws no gate.
    expect(at('recover', 2)).toBeNull();
    expect(at('recover', 3)).toEqual({ at: 1_122n, state: 'releasedRecover' });
  });
});
