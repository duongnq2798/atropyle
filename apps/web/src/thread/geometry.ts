import type { ThreadState } from './state';

export type Point = readonly [number, number];

/** The Thread draws in this box; the SVG stretches it to the box of its root (preserveAspectRatio="none"). */
export const VIEW = { w: 600, h: 120, mid: 60, amp: 9 } as const;
/** One and a half waves across the box: the wave crosses the middle at x = 0, 200, 400, 600. */
const CYCLES = 1.5;
/** Where the gate stands when nothing says when it opens; the wave is at the middle there. */
export const GATE_X = 400;
/**
 * The latest the gate stands on a time axis (drawnAxis): the branches after it keep a run of at least
 * BRANCH_END_X − GATE_MAX_X, and its arch stays inside the box.
 */
export const GATE_MAX_X = 500;
/** Where a thread in grace starts to fray, without a time axis. */
export const FRAY_X = 556;
/**
 * Where an expired Drill curls up, and where a recovery bends away when nothing says when it releases (on a time
 * axis with releaseAt, it bends at its gate).
 */
export const BEND_X = 352;
export const RECOVERY_END: Point = [588, 22];
/** Stroke widths are screen pixels: every path keeps them however the box stretches (non-scaling-stroke). */
export const MAIN_WIDTH = 3;
/** The dash of what the rules predict and the chain has not recorded yet. */
export const PREDICTED_DASH = '5 5';
/** Seconds of one beat of the glow (globals.css `--animate-thread-pulse`, `-mid`, `-fast`). */
export const BEAT_SECONDS = { slow: 2.4, mid: 1.6, fast: 1 } as const;
export type ThreadBeat = keyof typeof BEAT_SECONDS;
const SAMPLES = 16;
const BRANCH_END_X = 594;
const BAND = { top: 24, bottom: 96 } as const;
/** How far the outer strands of a fray stand from the thread, halfway through the alarm window. */
const FRAY_SPREAD = 7;
/** A fray shorter than this would be a knot, not a fray: it gets this length. */
const FRAY_MIN = 40;
/** courseX works in millionths of the axis, in bigint, before it turns into a number. */
const SCALE = 1_000_000n;

const r = (n: number): number => Math.round(n * 100) / 100;
const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1);

export function waveY(x: number): number {
  return VIEW.mid + VIEW.amp * Math.sin((x / VIEW.w) * Math.PI * 2 * CYCLES);
}

/** Catmull-Rom through the points (tension 0.5), written as cubic Bézier segments. */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  let d = `M${r(points[0][0])} ${r(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d;
}

/** The wave from x0 to x1, always `samples` segments long. */
export function waveSegment(x0: number, x1: number, samples = SAMPLES): string {
  const a = Math.min(x0, x1);
  const b = Math.max(x0, x1);
  const pts: Point[] = Array.from({ length: samples + 1 }, (_, i) => {
    const x = a + ((b - a) * i) / samples;
    return [x, waveY(x)];
  });
  return smoothPath(pts);
}

/**
 * Stroke width per heir: proportional to the share, scaled by √n so that the branches together look about as
 * heavy as the thread they come from; never under 1 so a small share stays visible.
 */
export function branchWidths(weights: readonly number[], main = MAIN_WIDTH): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const total = w.reduce((a, b) => a + b, 0);
  if (total === 0) return w.map(() => 1);
  const k = main * Math.sqrt(w.length);
  return w.map((x) => Math.max(1, r((k * x) / total)));
}

/** Y of each branch end, spread evenly over the band. */
export function branchEnds(n: number): number[] {
  if (n <= 1) return [VIEW.mid];
  return Array.from({ length: n }, (_, i) => r(BAND.top + ((BAND.bottom - BAND.top) * i) / (n - 1)));
}

/**
 * A linear time axis under the thread (R18.5): chain time `from` is x = 0, `to` is x = VIEW.w. The Thread draws on
 * drawnAxis(axis), which reaches past `to` when the gate would stand too close to the end.
 */
export interface ThreadAxis {
  /**
   * The start of the current period (lastAlive) wherever the state can be `active`: the glow beats by the share of
   * [from, alarmAt] still left after "now", so an axis that starts earlier beats too fast.
   */
  from: bigint;
  to: bigint;
  /** Chain time now: the "now" point, drawn only inside [from, to]. */
  now: bigint;
  /** When the alarm can be raised (active) or was raised (grace). The lit part of `active` ends here; `grace` frays from here. */
  alarmAt?: bigint | null;
  /** When the gate opens: the gate stands here, and the lit part of `grace` ends here. */
  releaseAt?: bigint | null;
  /**
   * Moments tied as knots (check-ins). Marks outside [from, to] are left out, never piled up at an edge; so are
   * marks past the gate once released (the branches take over), and past the bend of a recovery or an expired Drill.
   */
  marks?: readonly bigint[];
}

/**
 * X of chain time `t` on the axis: the subtraction runs in bigint and only the share of the axis becomes a number,
 * so unix seconds never lose a digit. Clamped to [0, VIEW.w]; an empty or reversed axis puts everything at 0.
 */
export function courseX(t: bigint, axis: Pick<ThreadAxis, 'from' | 'to'>): number {
  const span = axis.to - axis.from;
  if (span <= 0n) return 0;
  const d = t - axis.from;
  if (d <= 0n) return 0;
  if (d >= span) return VIEW.w;
  return r((Number((d * SCALE) / span) / Number(SCALE)) * VIEW.w);
}

/**
 * The axis the Thread draws on. When the gate would stand past GATE_MAX_X (an axis that ends at releaseAt or a few
 * minutes after it, like the vault header's, which ends when the heirs can claim), `to` moves later until the
 * gate stands at GATE_MAX_X: only the scale changes, and everything keeps its order and its share of the time.
 * Whatever is laid over a Thread by hand (the Scrubber's thumb and moments) is placed at courseX(t, drawnAxis(axis)).
 */
export function drawnAxis(axis: ThreadAxis): ThreadAxis {
  const { from, to, releaseAt } = axis;
  if (releaseAt == null || to <= from || releaseAt <= from) return axis;
  const w = BigInt(VIEW.w);
  const max = BigInt(GATE_MAX_X);
  // Rounded up, so that the gate never stands past GATE_MAX_X.
  const end = from + ((releaseAt - from) * w + max - 1n) / max;
  return end > to ? { ...axis, to: end } : axis;
}

/** Percent of the box width or height, for the HTML layer and the RevealWindow. */
export const pctX = (x: number): number => Math.round((x / VIEW.w) * 100_000) / 1000;
export const pctY = (y: number): number => Math.round((y / VIEW.h) * 100_000) / 1000;

/** The glow beats faster as the deadline nears: above half left slow, from a tenth to half mid, under a tenth fast. */
export function beatOf(left: number): ThreadBeat {
  if (left > 0.5) return 'slow';
  if (left >= 0.1) return 'mid';
  return 'fast';
}

export interface ThreadInput {
  /** Share of the current period still left, 0–1. Read by `active` and `grace`, and only without `axis`. */
  remaining?: number;
  /** Where check-ins tied knots, as fractions 0–1 of the drawn wave. Only without `axis` (it has `marks`). */
  knots?: readonly number[];
  /** One weight per heir (for example the share in basis points). Read by `releasedInherit` only. */
  branches?: readonly number[];
  /** Places "now", the lit part, the fray, the gate and the knots on a linear time axis. */
  axis?: ThreadAxis;
  /** What lies after "now" (the fray in `grace`, the branches once released) is the rules' prediction: dashed. */
  predicted?: boolean;
  /** A knot is being tied at "now": signed, not yet in a block. */
  pendingKnot?: boolean;
  /** Index of the branch of the reader (an heir): drawn in `thread`, the others in `ink-muted` at 35 %. */
  highlight?: number;
}

/** `plain` takes the state's colour; `highlight` and `muted` come from `highlight`. */
export type ThreadTone = 'plain' | 'highlight' | 'muted';

export interface ThreadGeometry {
  /** The course, drawn faint under the lit thread. Empty when the state has no course to show. */
  track: string;
  /** The lit course. Only its window [litFrom, litTo] shows, so moving "now" never changes this path. */
  lit: string;
  litFrom: number;
  litTo: number;
  /** The "now" point, or null when the state draws none. */
  now: Point | null;
  /** X of "now" also when no point is drawn: courseX(axis.now), else the start of what is left (active, grace), else VIEW.w. */
  nowX: number;
  /** The knot being tied (at "now"), or null. */
  pending: Point | null;
  knots: Point[];
  /** Where the gate arch stands, or null when the state draws no gate. */
  gate: Point | null;
  /** X of the gate, also when it is not drawn (the guardians' posts of Plan 7B stand here). */
  gateX: number;
  branches: { d: string; width: number; tone: ThreadTone }[];
  dots: { at: Point; tone: ThreadTone }[];
  fibers: string[];
  curl: string | null;
  ghost: string | null;
  /** Stroke dash of the fray and the branches: PREDICTED_DASH when `predicted`, else null. */
  dash: string | null;
  /** The glow's beat, or null when the state does not pulse (only `active` does). */
  beat: ThreadBeat | null;
}

function knotsOn(fractions: readonly number[] | undefined, end: number): Point[] {
  const xs = [...new Set((fractions ?? []).map((f) => r(clamp01(f) * end)))].sort((a, b) => a - b);
  return xs.map((x): Point => [x, r(waveY(x))]);
}

function marksOn(axis: ThreadAxis): Point[] {
  const inside = (axis.marks ?? []).filter((t) => t >= axis.from && t <= axis.to);
  const xs = [...new Set(inside.map((t) => courseX(t, axis)))].sort((a, b) => a - b);
  return xs.map((x): Point => [x, r(waveY(x))]);
}

/** From the gate (gx, gy) to the branch end; the curve keeps its shape when the gate moves along the axis. */
function branch(gx: number, gy: number, y: number): string {
  const k = (BRANCH_END_X - gx) / (BRANCH_END_X - GATE_X);
  return `M${gx} ${gy} C${r(gx + 60 * k)} ${gy} ${r(gx + 106 * k)} ${y} ${BRANCH_END_X} ${y}`;
}

/** Three strands from x0 to x1 that part from the thread and meet again at the gate. */
function frayStrands(x0: number, x1: number): string[] {
  return [-1, 0, 1].map((side) =>
    smoothPath(
      Array.from({ length: SAMPLES + 1 }, (_, i): Point => {
        const x = x0 + ((x1 - x0) * i) / SAMPLES;
        return [x, waveY(x) + side * FRAY_SPREAD * Math.sin((Math.PI * i) / SAMPLES)];
      }),
    ),
  );
}

export function threadGeometry(state: ThreadState, input: ThreadInput = {}): ThreadGeometry {
  const axis = input.axis ? drawnAxis(input.axis) : undefined;
  const gateX = axis?.releaseAt != null ? courseX(axis.releaseAt, axis) : GATE_X;
  const gateY = r(waveY(gateX));
  const base: ThreadGeometry = {
    track: '',
    lit: '',
    litFrom: 0,
    litTo: VIEW.w,
    now: null,
    nowX: axis ? courseX(axis.now, axis) : VIEW.w,
    pending: null,
    knots: [],
    gate: null,
    gateX,
    branches: [],
    dots: [],
    fibers: [],
    curl: null,
    ghost: null,
    dash: input.predicted ? PREDICTED_DASH : null,
    beat: null,
  };
  const knotsAt = (end: number): Point[] => (axis ? marksOn(axis) : knotsOn(input.knots, end));
  const withPending = (g: ThreadGeometry): ThreadGeometry => ({
    ...g,
    pending: input.pendingKnot && g.now ? g.now : null,
  });

  if ((state === 'active' || state === 'grace') && axis) {
    const nowX = base.nowX;
    // Outside the axis "now" would stand at an edge and tell the wrong time: it is left out, like a mark.
    const now: Point | null = axis.now >= axis.from && axis.now <= axis.to ? [nowX, r(waveY(nowX))] : null;
    const alarmX = axis.alarmAt != null ? courseX(axis.alarmAt, axis) : gateX;
    if (state === 'active') {
      // Nothing past the gate is lit, also where the alarm would come later (a gate cut short to a story's release).
      const litTo = Math.min(alarmX, gateX);
      return withPending({
        ...base,
        track: waveSegment(0, VIEW.w),
        lit: waveSegment(0, VIEW.w),
        litFrom: Math.min(nowX, litTo),
        litTo,
        now,
        knots: knotsAt(VIEW.w),
        gate: [gateX, gateY],
        beat: beatOf(alarmX > 0 ? clamp01((alarmX - nowX) / alarmX) : 0),
      });
    }
    // grace: the thread frays from the alarm and the strands meet again at the gate. A gate at or before the alarm
    // (an axis cut short) still gets a short fray after the alarm.
    const x0 = gateX > alarmX ? alarmX : Math.min(alarmX, VIEW.w - FRAY_MIN);
    const x1 = gateX > alarmX ? gateX : x0 + FRAY_MIN;
    return withPending({
      ...base,
      track: waveSegment(0, x0),
      lit: waveSegment(0, x0),
      litFrom: Math.min(nowX, x1),
      litTo: x1,
      now,
      knots: knotsAt(x0),
      gate: [gateX, gateY],
      fibers: frayStrands(x0, x1),
    });
  }

  if (state === 'active' || state === 'grace') {
    const end = state === 'grace' ? FRAY_X : VIEW.w;
    const left = input.remaining === undefined ? 1 : Number.isNaN(input.remaining) ? 1 : clamp01(input.remaining);
    const xNow = r(end * (1 - left));
    const fy = r(waveY(FRAY_X));
    return withPending({
      ...base,
      track: waveSegment(0, end),
      lit: waveSegment(0, end),
      litFrom: xNow,
      // In grace the window reaches past FRAY_X, over the strands.
      litTo: VIEW.w,
      now: left > 0 ? [xNow, r(waveY(xNow))] : null,
      nowX: xNow,
      knots: knotsOn(input.knots, end),
      fibers:
        state === 'grace'
          ? [
              `M${FRAY_X} ${fy} c12 -1 24 -9 38 -14`,
              `M${FRAY_X} ${fy} c14 0 26 2 40 1`,
              `M${FRAY_X} ${fy} c10 2 20 10 32 16`,
            ]
          : [],
      beat: state === 'active' ? beatOf(left) : null,
    });
  }

  if (state === 'recovery') {
    // On a time axis that says when the recovery releases, the thread bends to the new wallet there, at its gate:
    // the release ring and "now" stay on the thread up to the bend. Elsewhere it bends at BEND_X, with no gate.
    const timed = axis?.releaseAt != null;
    const bx = timed ? Math.min(gateX, GATE_MAX_X) : BEND_X;
    const by = r(waveY(bx));
    const [ex, ey] = RECOVERY_END;
    // The curve keeps its shape wherever the bend stands, like a branch from the gate.
    const k = (ex - bx) / (ex - BEND_X);
    return {
      ...base,
      lit: `${waveSegment(0, bx)} C${r(bx + 90 * k)} ${by} ${r(ex - 70 * k)} ${ey} ${ex} ${ey}`,
      // Past the bend the course is a ghost: a mark there is left out.
      knots: knotsAt(bx).filter(([x]) => x <= bx),
      gate: timed ? [bx, by] : null,
      ghost: waveSegment(bx, VIEW.w),
      dots: [{ at: RECOVERY_END, tone: 'plain' }],
    };
  }

  if (state === 'releasedInherit' || state === 'releasedRecover') {
    const weights = state === 'releasedRecover' || !input.branches?.length ? [1] : input.branches;
    const widths = branchWidths(weights);
    const ys = state === 'releasedRecover' ? [BAND.top] : branchEnds(weights.length);
    const h = input.highlight;
    const valid = h !== undefined && Number.isInteger(h) && h >= 0 && h < ys.length;
    const tone = (i: number): ThreadTone => (!valid ? 'plain' : i === h ? 'highlight' : 'muted');
    return {
      ...base,
      lit: waveSegment(0, gateX),
      // The course ends at the gate and the branches take over: a mark past the gate is left out.
      knots: knotsAt(gateX).filter(([x]) => x <= gateX),
      gate: [gateX, gateY],
      branches: ys.map((y, i) => ({ d: branch(gateX, gateY, y), width: widths[i], tone: tone(i) })),
      dots: ys.map((y, i) => ({ at: [BRANCH_END_X, y] as Point, tone: tone(i) })),
    };
  }

  // expired: a short thread that curls up.
  const ey = r(waveY(BEND_X));
  return {
    ...base,
    lit: waveSegment(0, BEND_X),
    // The thread ends in the curl: a mark past it is left out.
    knots: knotsAt(BEND_X).filter(([x]) => x <= BEND_X),
    curl: `M${BEND_X} ${ey} c36 0 64 -12 64 6 s-22 26 -38 12 s2 -22 18 -14 s6 10 -4 12`,
  };
}
