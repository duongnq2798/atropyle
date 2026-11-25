// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BEAT_SECONDS,
  BEND_X,
  beatOf,
  branchEnds,
  branchWidths,
  courseX,
  drawnAxis,
  FRAY_X,
  GATE_MAX_X,
  GATE_X,
  PREDICTED_DASH,
  RECOVERY_END,
  smoothPath,
  type ThreadAxis,
  type ThreadInput,
  threadGeometry,
  VIEW,
  waveSegment,
  waveY,
} from '../../src/thread/geometry';
import { THREAD_STATES, threadRemaining, threadStateOf } from '../../src/thread/state';

/** Path commands and numbers only, one or more subpaths; never NaN, undefined or Infinity. */
const VALID = /^M[0-9.\- ]+(?:[MCcSsVvHhAaLl][0-9.\- ]+)*$/;
const y2 = (x: number) => Math.round(waveY(x) * 100) / 100;

describe('wave', () => {
  it('stays inside the band and crosses the middle at the gate', () => {
    for (let x = 0; x <= VIEW.w; x += 7) {
      expect(waveY(x)).toBeGreaterThanOrEqual(VIEW.mid - VIEW.amp);
      expect(waveY(x)).toBeLessThanOrEqual(VIEW.mid + VIEW.amp);
    }
    expect(waveY(0)).toBeCloseTo(VIEW.mid, 9);
    expect(waveY(GATE_X)).toBeCloseTo(VIEW.mid, 9);
  });

  it('turns n points into one move and n − 1 cubic segments through them', () => {
    const d = smoothPath([
      [0, 60],
      [100, 50],
      [200, 70],
    ]);
    expect(d.startsWith('M0 60 C')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(d.endsWith(' 200 70')).toBe(true);
    expect(smoothPath([])).toBe('');
  });

  it('samples every segment with the same structure', () => {
    const a = waveSegment(0, 600);
    const b = waveSegment(300, 600);
    expect(a.match(/C/g)).toHaveLength(16);
    expect(b.match(/C/g)).toHaveLength(16);
    expect(b.startsWith('M300 ')).toBe(true);
  });
});

describe('branches', () => {
  it('keeps the shares in proportion and a single heir as thick as the thread', () => {
    expect(branchWidths([1])).toEqual([3]);
    const [a, b] = branchWidths([7000, 3000]);
    expect(a / b).toBeCloseTo(7 / 3, 1);
    expect(branchWidths([1, 1, 1, 1])).toEqual([1.5, 1.5, 1.5, 1.5]);
  });

  it('never draws a branch thinner than 1 and survives zero, negative and NaN weights', () => {
    expect(branchWidths([9999, 1])[1]).toBe(1);
    expect(branchWidths([0, 0])).toEqual([1, 1]);
    expect(branchWidths([Number.NaN, -5, 10])).toEqual([1, 1, 5.2]);
  });

  it('fans the branch ends out evenly inside the view', () => {
    expect(branchEnds(1)).toEqual([60]);
    expect(branchEnds(3)).toEqual([24, 60, 96]);
    for (const y of branchEnds(12)) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(VIEW.h);
    }
  });
});

describe('courseX', () => {
  const axis = { from: 1_000n, to: 1_600n };

  it('maps chain time linearly onto the width and clamps outside the axis', () => {
    expect(courseX(1_000n, axis)).toBe(0);
    expect(courseX(1_300n, axis)).toBe(300);
    expect(courseX(1_600n, axis)).toBe(VIEW.w);
    expect(courseX(999n, axis)).toBe(0);
    expect(courseX(-(2n ** 200n), axis)).toBe(0);
    expect(courseX(2n ** 200n, axis)).toBe(VIEW.w);
  });

  it('never divides by zero: an empty or reversed axis puts everything at 0', () => {
    for (const t of [0n, 999n, 1_000n, 1_001n, 2n ** 70n]) {
      expect(courseX(t, { from: 1_000n, to: 1_000n })).toBe(0);
      expect(courseX(t, { from: 1_600n, to: 1_000n })).toBe(0);
    }
  });

  it('is monotonic and exact on unix seconds', () => {
    const from = 1_795_000_000n;
    const half = { from, to: from + 15_552_000n };
    expect(courseX(from + 3_888_000n, half)).toBe(150);
    let last = -1;
    for (let t = from - 86_400n; t <= half.to + 86_400n; t += 97_001n) {
      const x = courseX(t, half);
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
    // A huge axis stays finite: only the share of it becomes a number.
    expect(courseX(2n ** 1100n, { from: 0n, to: 2n ** 1101n })).toBe(300);
  });
});

describe('threadGeometry without an axis', () => {
  it('active: the whole course is lit, and the window shows what is left, from "now"', () => {
    const g = threadGeometry('active', { remaining: 0.25 });
    expect(g.now?.[0]).toBe(450);
    expect(g.now?.[1]).toBeCloseTo(waveY(450), 2);
    expect(g.nowX).toBe(450);
    expect([g.litFrom, g.litTo]).toEqual([450, VIEW.w]);
    expect(g.lit).toBe(waveSegment(0, VIEW.w));
    expect(g.track.startsWith('M0 60 ')).toBe(true);
    expect(g.gate).toBeNull();
    expect(g.gateX).toBe(GATE_X);
  });

  it('clamps remaining to 0–1 and hides "now" when nothing is left', () => {
    expect(threadGeometry('active', { remaining: 7 }).now?.[0]).toBe(0);
    expect(threadGeometry('active', { remaining: -1 }).now).toBeNull();
    expect(threadGeometry('active', { remaining: Number.NaN }).now?.[0]).toBe(0);
  });

  it('ties knots on the wave, once each, in order', () => {
    const g = threadGeometry('active', { remaining: 0.5, knots: [0.5, 0, 0.5, 2, -1] });
    expect(g.knots.map(([x]) => x)).toEqual([0, 300, 600]);
    for (const [x, y] of g.knots) expect(y).toBeCloseTo(waveY(x), 2);
  });

  it('grace: frays into three strands before the end, inside the window', () => {
    const g = threadGeometry('grace', { remaining: 0.5 });
    expect(g.fibers).toHaveLength(3);
    for (const f of g.fibers) expect(f.startsWith(`M${FRAY_X} `)).toBe(true);
    expect(g.now?.[0]).toBe(FRAY_X / 2);
    expect([g.litFrom, g.litTo]).toEqual([FRAY_X / 2, VIEW.w]);
    expect(g.beat).toBeNull();
  });

  it('recovery: bends to the new wallet and keeps the old course as a ghost', () => {
    const g = threadGeometry('recovery');
    expect(g.lit.endsWith(`${RECOVERY_END[0]} ${RECOVERY_END[1]}`)).toBe(true);
    expect(g.ghost?.startsWith(`M${BEND_X} `)).toBe(true);
    expect(g.dots).toEqual([{ at: RECOVERY_END, tone: 'plain' }]);
  });

  it('releasedInherit: through the gate, one branch per heir, each starting at the gate on the wave', () => {
    const g = threadGeometry('releasedInherit', { branches: [5000, 3000, 2000] });
    expect(g.gate).toEqual([GATE_X, y2(GATE_X)]);
    expect(g.branches).toHaveLength(3);
    expect(g.dots).toHaveLength(3);
    expect(g.branches[0].width).toBeGreaterThan(g.branches[2].width);
    for (const b of g.branches) expect(b.d.startsWith(`M${g.gateX} ${y2(g.gateX)} `)).toBe(true);
  });

  it('releasedRecover: through the gate to one wallet', () => {
    const g = threadGeometry('releasedRecover');
    expect(g.branches).toHaveLength(1);
    expect(g.dots[0].at[1]).toBeLessThan(VIEW.mid);
  });

  it('expired: a short thread that curls up', () => {
    const g = threadGeometry('expired');
    expect(g.curl).not.toBeNull();
    expect(g.now).toBeNull();
    expect(g.track).toBe('');
  });
});

describe('threadGeometry on a time axis', () => {
  const axis: ThreadAxis = { from: 1_000n, to: 1_600n, now: 1_150n, alarmAt: 1_450n, releaseAt: 1_500n };

  it('active: "now", the end of the lit part and the gate sit at courseX of their times', () => {
    const g = threadGeometry('active', { axis });
    expect(g.nowX).toBe(150);
    expect(g.now).toEqual([150, y2(150)]);
    expect([g.litFrom, g.litTo]).toEqual([150, 450]);
    expect(g.gate).toEqual([500, y2(500)]);
    expect(g.gateX).toBe(500);
    expect(g.lit).toBe(waveSegment(0, VIEW.w));
  });

  it('ties a knot at each mark inside the axis, once, and leaves the others out', () => {
    const g = threadGeometry('active', { axis: { ...axis, marks: [900n, 1_000n, 1_100n, 1_100n, 1_700n] } });
    expect(g.knots).toEqual([
      [0, y2(0)],
      [100, y2(100)],
    ]);
    // The fractions of `knots` belong to the old mode and are ignored on an axis.
    expect(threadGeometry('active', { axis, knots: [0.5] }).knots).toEqual([]);
  });

  it('grace: frays from the alarm to the gate; the window runs from "now" to the gate', () => {
    const g = threadGeometry('grace', { axis: { ...axis, now: 1_350n, alarmAt: 1_300n } });
    expect(g.fibers).toHaveLength(3);
    for (const f of g.fibers) expect(f.startsWith('M300 ')).toBe(true);
    for (const f of g.fibers) expect(f.endsWith(` 500 ${y2(500)}`)).toBe(true);
    expect(g.track).toBe(waveSegment(0, 300));
    expect([g.litFrom, g.litTo]).toEqual([350, 500]);
    expect(g.now).toEqual([350, y2(350)]);
    expect(g.gate?.[0]).toBe(500);
  });

  it('puts the gate on the wave wherever releaseAt falls, and the branches start there', () => {
    const g = threadGeometry('releasedInherit', { axis: { ...axis, releaseAt: 1_300n }, branches: [1, 1] });
    expect(g.gate).toEqual([300, 51]);
    for (const b of g.branches) expect(b.d.startsWith('M300 51 ')).toBe(true);
  });

  it('released: the course ends at the gate, so a mark past it is left out', () => {
    const marks = [1_100n, 1_500n, 1_550n];
    for (const s of ['releasedInherit', 'releasedRecover'] as const) {
      expect(threadGeometry(s, { axis: { ...axis, marks } }).knots, s).toEqual([
        [100, y2(100)],
        [500, y2(500)],
      ]);
    }
    // Active runs on past the gate, and keeps the mark.
    expect(threadGeometry('active', { axis: { ...axis, marks } }).knots.map(([x]) => x)).toEqual([100, 500, 550]);
  });

  it('keeps room after the gate wherever releaseAt falls, up to and past the end of the axis', () => {
    // The vault header's axis ends when the heirs can claim, a few minutes after releaseAt (spec §18.4.2 Task 9).
    const span = 30n * 86_400n;
    const from = 1_795_000_000n;
    const ats = [
      from - 60n,
      from,
      from + span / 2n,
      from + (span * 5n) / 6n,
      from + span - 300n,
      from + span,
      from + 2n * span,
    ];
    // The arch is h-[42%] high and 12/25 as wide: at 5:1 half of it is 0.42 · 12/25 / 5 / 2 of the width.
    const halfArch = VIEW.w * ((0.42 * 12) / 25 / 5 / 2);
    for (const releaseAt of ats) {
      const a: ThreadAxis = { from, to: from + span, now: from + 60n, alarmAt: releaseAt - 3_600n, releaseAt };
      for (const s of THREAD_STATES) {
        const g = threadGeometry(s, { axis: a, branches: [5000, 3000, 2000] });
        const at = `${s} at ${releaseAt - from}`;
        if (g.gate) {
          expect(g.gateX, at).toBeLessThanOrEqual(GATE_MAX_X);
          expect(g.gateX + halfArch, at).toBeLessThan(VIEW.w);
        }
        for (const b of g.branches) {
          const n = b.d.match(/-?[\d.]+/g)?.map(Number) ?? [];
          // M gx gy C c1x c1y c2x c2y ex ey: the branch runs right, never back, and ends well past the gate.
          expect(n[2], at).toBeGreaterThanOrEqual(g.gateX);
          expect(n[4], at).toBeGreaterThanOrEqual(n[2]);
          expect(n[6] - g.gateX, at).toBeGreaterThanOrEqual(90);
        }
        for (const d of g.dots) if (g.branches.length) expect(d.at[0] - g.gateX, at).toBeGreaterThanOrEqual(90);
      }
    }
    // Only the scale changes: "now", the alarm and the gate keep their order and their shares of the time.
    const late: ThreadAxis = { from: 0n, to: 600n, now: 300n, alarmAt: 540n, releaseAt: 600n };
    const g = threadGeometry('active', { axis: late });
    expect([g.nowX, g.litTo, g.gateX]).toEqual([250, 450, GATE_MAX_X]);
    expect(drawnAxis(late)).toEqual({ ...late, to: 720n });
    expect(courseX(late.now, drawnAxis(late))).toBe(g.nowX);
    // An axis with room after the gate is drawn as it is.
    expect(drawnAxis(axis)).toBe(axis);
    expect(drawnAxis({ from: 0n, to: 600n, now: 0n })).toEqual({ from: 0n, to: 600n, now: 0n });
  });

  it('shows "now" only inside the axis, and no knot past the bend of a recovery or the curl of an expired Drill', () => {
    for (const now of [900n, 1_700n]) {
      const g = threadGeometry('active', { axis: { ...axis, now }, pendingKnot: true });
      expect(g.now, String(now)).toBeNull();
      expect(g.pending, String(now)).toBeNull();
    }
    expect(threadGeometry('grace', { axis: { ...axis, now: 1_700n } }).now).toBeNull();
    const marks = [1_100n, 1_352n, 1_500n];
    for (const s of ['recovery', 'expired'] as const) {
      expect(
        threadGeometry(s, { axis: { ...axis, marks } }).knots.map(([x]) => x),
        s,
      ).toEqual([100, BEND_X]);
    }
  });

  it('falls back to GATE_X without releaseAt, and ends the lit part of active at the gate without alarmAt', () => {
    const g = threadGeometry('active', { axis: { from: 0n, to: 600n, now: 100n } });
    expect(g.gateX).toBe(GATE_X);
    expect([g.litFrom, g.litTo]).toEqual([100, GATE_X]);
  });

  it('past the alarm time the lit part is empty and the glow beats fast', () => {
    const g = threadGeometry('active', { axis: { ...axis, now: 1_480n } });
    expect(g.nowX).toBe(480);
    expect([g.litFrom, g.litTo]).toEqual([450, 450]);
    expect(g.beat).toBe('fast');
  });
});

describe('the props of Plan 7B', () => {
  const inputs: ThreadInput[] = [
    { remaining: 0.3, knots: [0.1], branches: [2, 1] },
    { axis: { from: 0n, to: 600n, now: 250n, alarmAt: 200n, releaseAt: 450n, marks: [50n] }, branches: [2, 1] },
  ];

  it('predicted changes only the stroke style, in every state, with and without an axis', () => {
    for (const s of THREAD_STATES) {
      for (const input of inputs) {
        const plain = threadGeometry(s, input);
        const told = threadGeometry(s, { ...input, predicted: true });
        expect(plain.dash, s).toBeNull();
        expect(told.dash, s).toBe(PREDICTED_DASH);
        expect({ ...told, dash: null }, s).toEqual(plain);
      }
    }
  });

  it('highlight lights one branch and mutes the others; an index that names no branch changes nothing', () => {
    const g = threadGeometry('releasedInherit', { branches: [5000, 3000, 2000], highlight: 1 });
    expect(g.branches.map((b) => b.tone)).toEqual(['muted', 'highlight', 'muted']);
    expect(g.dots.map((d) => d.tone)).toEqual(['muted', 'highlight', 'muted']);
    for (const h of [3, -1, 1.5, Number.NaN]) {
      const n = threadGeometry('releasedInherit', { branches: [5000, 3000, 2000], highlight: h });
      expect(
        n.branches.map((b) => b.tone),
        String(h),
      ).toEqual(['plain', 'plain', 'plain']);
    }
  });

  it('pendingKnot puts a knot being tied at "now", and nowhere when there is no "now"', () => {
    expect(threadGeometry('active', { remaining: 0.5, pendingKnot: true }).pending).toEqual([300, y2(300)]);
    expect(threadGeometry('active', { remaining: 0.5 }).pending).toBeNull();
    expect(threadGeometry('active', { axis: inputs[1].axis, pendingKnot: true }).pending).toEqual([250, y2(250)]);
    expect(threadGeometry('releasedInherit', { pendingKnot: true }).pending).toBeNull();
  });
});

describe('the beat', () => {
  it('quickens near the deadline: above half slow, a tenth to half mid, under a tenth fast', () => {
    expect([1, 0.51, 0.5, 0.1, 0.099, 0].map(beatOf)).toEqual(['slow', 'slow', 'mid', 'mid', 'fast', 'fast']);
    expect(threadGeometry('active', { remaining: 0.72 }).beat).toBe('slow');
    expect(threadGeometry('active', { remaining: 0.3 }).beat).toBe('mid');
    expect(threadGeometry('active', { remaining: 0.05 }).beat).toBe('fast');
    expect(threadGeometry('active', { axis: { from: 0n, to: 600n, now: 10n, alarmAt: 400n } }).beat).toBe('slow');
    for (const s of THREAD_STATES.filter((x) => x !== 'active')) expect(threadGeometry(s).beat, s).toBeNull();
  });

  it('globals.css runs thread-pulse once per beat: 2.4 s, 1.6 s and 1 s', () => {
    const css = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');
    const token = { slow: 'thread-pulse', mid: 'thread-pulse-mid', fast: 'thread-pulse-fast' } as const;
    expect(BEAT_SECONDS).toEqual({ slow: 2.4, mid: 1.6, fast: 1 });
    for (const [beat, name] of Object.entries(token) as [keyof typeof token, string][]) {
      expect(css, beat).toMatch(new RegExp(`--animate-${name}:\\s*thread-pulse ${BEAT_SECONDS[beat]}s `));
    }
  });
});

describe('every path', () => {
  it('is well formed in every state, with and without an axis', () => {
    const axis: ThreadAxis = { from: 0n, to: 600n, now: 250n, alarmAt: 200n, releaseAt: 450n, marks: [50n] };
    const odd: ThreadAxis = { from: 0n, to: 600n, now: 599n, alarmAt: 600n, releaseAt: 100n };
    for (const s of THREAD_STATES) {
      for (const input of [{ remaining: 0.3, knots: [0.1] }, { axis }, { axis: odd }] as ThreadInput[]) {
        const g = threadGeometry(s, { ...input, branches: [2, 1] });
        const all = [g.track, g.lit, g.curl, g.ghost, ...g.fibers, ...g.branches.map((b) => b.d)];
        for (const d of all) if (d) expect(d, `${s}: ${d}`).toMatch(VALID);
        for (const n of [g.litFrom, g.litTo, g.nowX, g.gateX]) {
          expect(n, s).toBeGreaterThanOrEqual(0);
          expect(n, s).toBeLessThanOrEqual(VIEW.w);
        }
        expect(g.litFrom, s).toBeLessThanOrEqual(g.litTo);
      }
    }
  });
});

describe('thread state', () => {
  const base = { lastAlive: 1000n, lateAt: 2000n, alarmAt: null, windowEndsAt: null, expired: false } as const;

  it('maps an expired Drill to its own state', () => {
    expect(threadStateOf({ state: 'active', expired: false })).toBe('active');
    expect(threadStateOf({ state: 'active', expired: true })).toBe('expired');
  });

  it('measures what is left until the owner is late', () => {
    expect(threadRemaining({ ...base, state: 'active' }, 1000n)).toBe(1);
    expect(threadRemaining({ ...base, state: 'active' }, 1750n)).toBe(0.25);
    expect(threadRemaining({ ...base, state: 'active' }, 5000n)).toBe(0);
  });

  it('measures the alarm window while an alarm runs', () => {
    const s = { ...base, state: 'grace' as const, alarmAt: 3000n, windowEndsAt: 4000n };
    expect(threadRemaining(s, 3500n)).toBe(0.5);
  });

  it('has nothing left once released or expired, and survives an empty period', () => {
    expect(threadRemaining({ ...base, state: 'releasedInherit' }, 1500n)).toBe(0);
    expect(threadRemaining({ ...base, state: 'active', expired: true }, 1500n)).toBe(0);
    expect(threadRemaining({ ...base, state: 'active', lateAt: 1000n }, 1000n)).toBe(0);
  });
});
