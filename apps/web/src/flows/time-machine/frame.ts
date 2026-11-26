import { courseX, drawnAxis, pctX, type ThreadAxis } from '@/thread/geometry';
import type { ThreadState } from '@/thread/state';
import type { Moment, ScenarioRun } from '../impl/time-machine';

// The frame lookups and the Scrubber's scale, with no SDK: the UI calls them on every render, before and after the
// time machine chunk loads. impl/time-machine.ts re-exports frameAt and frameIndex.

/** Index of the latest moment at or before `at` (moments are in time order); the first moment before it. */
export function frameIndex(run: ScenarioRun, at: bigint): number {
  let index = 0;
  for (let i = 0; i < run.moments.length; i++) {
    if (run.moments[i].at > at) break;
    index = i;
  }
  return index;
}

/** The latest moment at or before `at` (the first moment before it). */
export function frameAt(run: ScenarioRun, at: bigint): Moment {
  return run.moments[frameIndex(run, at)];
}

/** Where the Scrubber's slider runs (R18.5): from the run's start to the end of the Thread's drawn axis. */
export interface ScrubAxis {
  from: bigint;
  to: bigint;
  /** Seconds from `from` to `to`: the slider's max. */
  span: number;
  /** The slider's step: about 200 steps over the span, never under a second. */
  step: number;
  /** The run's own release, or null when it has none (a Drill that ends first). */
  release: bigint | null;
}

/**
 * One scale per run. The axis ends where drawnAxis puts it for the story's own release (its end when it has none),
 * and threadFrame never draws a gate later than that, so the Thread's drawnAxis never stretches a frame: the thumb
 * and the moments, placed at courseX on this axis, stay on the thread in every frame.
 */
export function scrubAxis(run: ScenarioRun): ScrubAxis {
  const from = run.moments[0].at;
  const release = run.moments.find((m) => m.kind === 'release')?.at ?? null;
  const to = drawnAxis({ from, to: run.end, now: from, releaseAt: release ?? run.end }).to;
  const span = Number(to - from);
  return { from, to, span, step: Math.max(1, Math.round(span / 200)), release };
}

export interface ThreadFrame {
  state: ThreadState;
  axis: ThreadAxis;
}

/**
 * What the Thread draws at chain time `at`, inside the frame of moment `index`: that moment's state (expired from
 * the Drill's end on), its alarm, its gate (the outlook's release, never later than the story's), and the knots of
 * the check-ins so far.
 */
export function threadFrame(
  run: ScenarioRun,
  axis: ScrubAxis,
  index: number,
  at: bigint,
  expiresAt: bigint | null,
): ThreadFrame {
  const m = run.moments[index];
  const cap = axis.release ?? run.end;
  const releaseAt = m.releaseAt === null || m.releaseAt > cap ? cap : m.releaseAt;
  const marks = run.moments
    .slice(1, index + 1)
    .filter((x) => x.kind === 'checkIn')
    .map((x) => x.at);
  return {
    state: expiresAt !== null && at >= expiresAt ? 'expired' : m.state,
    axis: { from: axis.from, to: axis.to, now: at, alarmAt: m.alarmAt, releaseAt, marks },
  };
}

/** The states whose Thread draws a gate (a recovery bends away, an expired Drill curls up). */
const GATED: ReadonlySet<ThreadState> = new Set(['active', 'grace', 'releasedInherit', 'releasedRecover']);

/**
 * The time of the gate the Thread draws in the frame of moment `index`, at chain time `at`: that moment's own
 * release, in the state the frame is drawn in. Null when the frame draws no gate, and when the gate stands at the
 * story's release only because the outlook's release lies past it (threadFrame's cap): that gate has no time to say.
 */
export function gateOf(
  run: ScenarioRun,
  axis: ScrubAxis,
  index: number,
  at: bigint,
  expiresAt: bigint | null,
): { at: bigint; state: ThreadState } | null {
  const release = run.moments[index].releaseAt;
  const f = threadFrame(run, axis, index, at, expiresAt);
  if (!GATED.has(f.state) || release === null || f.axis.releaseAt !== release) return null;
  return { at: release, state: f.state };
}

/**
 * Rings closer than this, in percent of the track, merge: 3.5 % of a phone's track (about 282 px) is 10 px, the
 * width of a ring.
 */
export const RING_MERGE = 3.5;

/** A ring on the Scrubber's thread: one moment, or several that would touch. */
export interface MomentRing {
  /** The moments it stands for, in time order. */
  members: number[];
  /** The latest of them: its state colours the ring, and the slider's value is in its frame from there on. */
  index: number;
  state: ThreadState;
  /** X on the Thread's 600-wide box: the latest moment's, or a knot's check-in's, where the Thread ties it. */
  x: number;
  /** It stands for a check-in: drawn as the knot the Thread ties there. */
  knot: boolean;
}

/**
 * The moments after the first as rings: one per moment, except that a moment within RING_MERGE of the first moment
 * of the ring before joins it (the votes a second apart, the confirmations right after an alarm). A check-in never
 * joins a ring of other moments: the owner's knot is the product's mark (spec §4.1), so it starts its own.
 */
export function momentRings(run: ScenarioRun, axis: ScrubAxis): MomentRing[] {
  const rings: MomentRing[] = [];
  let anchor = 0;
  for (let i = 1; i < run.moments.length; i++) {
    const m = run.moments[i];
    const x = courseX(m.at, axis);
    const knot = m.kind === 'checkIn';
    const last = rings.at(-1);
    if (last && (last.knot || !knot) && pctX(x) - anchor < RING_MERGE) {
      last.members.push(i);
      last.index = i;
      last.state = m.state;
      if (knot || !last.knot) last.x = x;
      continue;
    }
    anchor = pctX(x);
    rings.push({ members: [i], index: i, state: m.state, x, knot });
  }
  return rings;
}

/** Each moment as seconds after the first, the slider's unit. */
export function momentOffsets(run: ScenarioRun): number[] {
  const from = run.moments[0].at;
  return run.moments.map((m) => Number(m.at - from));
}

/** The first moment after `value` (Page Up), or null past the last. */
export function nextOffset(offsets: readonly number[], value: number): number | null {
  let best: number | null = null;
  for (const o of offsets) if (o > value && (best === null || o < best)) best = o;
  return best;
}

/** The last moment before `value` (Page Down), or null before the first. */
export function prevOffset(offsets: readonly number[], value: number): number | null {
  let best: number | null = null;
  for (const o of offsets) if (o < value && (best === null || o > best)) best = o;
  return best;
}

export function clampOffset(offset: number, span: number): number {
  return Math.min(Math.max(0, Math.round(offset)), span);
}
