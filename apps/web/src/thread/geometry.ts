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
/** A vault's own wave samples twice as finely: its third harmonic runs up to four cycles across the box. */
const SIGNED_SAMPLES = 32;
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

/** One harmonic of a vault's own wave: `f` cycles across VIEW.w, starting at `phase`, weighing `w`. */
export interface Harmonic {
  readonly f: number;
  readonly phase: number;
  readonly w: number;
}
/** Three harmonics whose weights sum to 1, so the wave stays within VIEW.mid ± VIEW.amp. */
export type ThreadSignature = readonly Harmonic[];

/** Spec §18.4.2 T6: the three harmonics run 1.5 to 4 cycles across VIEW.w, one band each. */
export const HARMONIC_BANDS = [
  [1.5, 2],
  [2, 3],
  [3, 4],
] as const;
/** The weights of the second and third harmonics before CALM; the first takes the rest. */
const WEIGHT_BANDS = [
  [0.1, 0.3],
  [0.05, 0.2],
] as const;
/**
 * The clamp of spec §18.4.2 T6: the second and third harmonics together turn the slope at most this share of what
 * the first one does (w2·f2 + w3·f3 ≤ CALM · w1·f1), so no knot or gate lands on a wiggle. At 0.4, turning points
 * stay more than a sixth of the box apart (20 000 random waves: at least 124 units); at 0.5, two came 7.5 apart.
 */
export const CALM = 0.4;
/**
 * The shape of isAddressText (src/lib/address.ts): a lowercase 0x, then 40 hex digits in any case. The SDK's toAddress
 * also takes 0X or no prefix at all; the thread does not, on purpose: it draws a vault's own wave only for the form
 * an address is shown in, and anything else draws the default wave.
 */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** FNV-1a over the text, then murmur3's finaliser, so that every hex digit moves every bit. */
function mix(text: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A vault's own wave (R18.3): the same in the header, the preview, the letter and print, for every reader. Six bytes
 * hashed from the 40 hex digits in lowercase, so the case of the address changes nothing and a lookalike address
 * gets another wave; two bytes per harmonic: 6 bits of frequency, 6 of phase, 4 of weight. null for text that is not
 * an address, and the Thread draws the default wave. A look, never a check: people compare the address itself.
 */
export function threadSignature(address: string): ThreadSignature | null {
  // The shape is checked before any lowercasing, so 0X… stays null; then only the 40 digits are lowered.
  const text = address.trim();
  if (!ADDRESS.test(text)) return null;
  const hex = text.slice(2).toLowerCase();
  const a = mix(hex, 0x811c9dc5);
  const b = mix(hex, 0x050c5d1f);
  const raw = [a >>> 16, a & 0xffff, b >>> 16].map((word, i) => {
    const [lo, hi] = HARMONIC_BANDS[i];
    return {
      f: lo + ((hi - lo) * (word >>> 10)) / 63,
      phase: (2 * Math.PI * ((word >>> 4) & 63)) / 64,
      q: (word & 15) / 15,
    };
  });
  const [f1, f2, f3] = raw.map((h) => h.f);
  let w2 = WEIGHT_BANDS[0][0] + (WEIGHT_BANDS[0][1] - WEIGHT_BANDS[0][0]) * raw[1].q;
  let w3 = WEIGHT_BANDS[1][0] + (WEIGHT_BANDS[1][1] - WEIGHT_BANDS[1][0]) * raw[2].q;
  const turn = w2 * f2 + w3 * f3;
  if (turn > CALM * f1 * (1 - w2 - w3)) {
    // Scale w2 and w3 by t, with w1 = 1 − t(w2 + w3), so that t · turn = CALM · f1 · w1 exactly.
    const t = (CALM * f1) / (turn + CALM * f1 * (w2 + w3));
    w2 *= t;
    w3 *= t;
  }
  const w = [1 - w2 - w3, w2, w3];
  return raw.map((h, i) => ({ f: h.f, phase: h.phase, w: w[i] }));
}

/** The wave at x: the default one, or a vault's own (threadSignature) when `sig` is set. */
export function waveY(x: number, sig?: ThreadSignature | null): number {
  if (!sig) return VIEW.mid + VIEW.amp * Math.sin((x / VIEW.w) * Math.PI * 2 * CYCLES);
  let y = 0;
  for (const h of sig) y += h.w * Math.sin((x / VIEW.w) * Math.PI * 2 * h.f + h.phase);
  return VIEW.mid + VIEW.amp * y;
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

/** The wave from x0 to x1, always the same number of segments: 16, or 32 on a vault's own wave. */
export function waveSegment(x0: number, x1: number, samples?: number, sig?: ThreadSignature | null): string {
  const n = samples ?? (sig ? SIGNED_SAMPLES : SAMPLES);
  const a = Math.min(x0, x1);
  const b = Math.max(x0, x1);
  const pts: Point[] = Array.from({ length: n + 1 }, (_, i) => {
    const x = a + ((b - a) * i) / n;
    return [x, waveY(x, sig)];
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

/** At most one post per guardian a vault can have (LIMITS.maxGuardians; thread-geometry.test.ts keeps them equal). */
export const MAX_POSTS = 5;
/**
 * A post's width and the gap between two, in percent of the arch's inside (the gate less its walls): five posts and
 * six gaps fill it, 5 × 8 + 6 × 10 = 100, so the walls count as neighbours and every gap is wider than a post.
 */
export const POST_WIDTH = 8;
export const POST_GAP = 10;
/** A standing post's height, in percent of the gate's box. */
export const POST_HEIGHT = 34;
/** An unlit post's height, in percent of a standing one: a guardian who has not confirmed is not standing yet. */
export const POST_STUB = 40;
/**
 * How far the bar reaches past the first and the k-th post, in the same percent: half a post. Over one post it is then
 * a bar (a T once that guardian stands), not a dot; and it ends nearer post k than post k + 1.
 */
export const BAR_OVERHANG = POST_WIDTH / 2;

export interface ThreadPosts {
  /** One post per guardian, 1 to MAX_POSTS. */
  n: number;
  /** How many must confirm: the bar covers the first k posts (BAR_OVERHANG past each end); 0 draws no bar. */
  k: number;
  /**
   * How many have confirmed: the first `lit` posts stand, filled; the others are stubs (POST_STUB). A count: which
   * guardian it was, the list says.
   */
  lit: number;
  /** The left edge of each post, in percent of the arch's inside; the group is centred. */
  left: number[];
  bar: { left: number; width: number } | null;
}

const whole = (v: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);

/** The posts a gate can draw: n up to MAX_POSTS, k and lit up to n; null when there is no post to draw. */
export function postsOf(p: ThreadInput['posts']): ThreadPosts | null {
  if (!p) return null;
  const n = whole(p.n, MAX_POSTS);
  if (n === 0) return null;
  const k = whole(p.k, n);
  const lit = whole(p.lit, n);
  const span = n * POST_WIDTH + (n - 1) * POST_GAP;
  const x0 = (100 - span) / 2;
  return {
    n,
    k,
    lit,
    left: Array.from({ length: n }, (_, i) => r(x0 + i * (POST_WIDTH + POST_GAP))),
    bar:
      k > 0 ? { left: r(x0 - BAR_OVERHANG), width: r(k * POST_WIDTH + (k - 1) * POST_GAP + 2 * BAR_OVERHANG) } : null,
  };
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
  /**
   * The vault's address: the wave becomes the vault's own (threadSignature); text that is not an address draws the
   * default wave. Whatever is laid over such a Thread by hand must then place itself with waveY(x, signature): the
   * Scrubber does not, so the time machine draws the default wave (T6 passes no signature to it).
   */
  signature?: string;
  /** The guardians at the gate: n of them, k must confirm, `lit` have. Drawn only where a gate stands. */
  posts?: { n: number; k: number; lit: number };
  /**
   * The recovery exit (loom-preview): a dashed path that leaves the course before the gate, for a plan whose guardians
   * can move it to a new wallet. Drawn on `releasedInherit` only.
   */
  exit?: boolean;
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
  /** The guardians' posts in the gate (postsOf), or null: no gate, no guardian, or no `posts`. */
  posts: ThreadPosts | null;
  /** The recovery exit: its path and where it ends, or null. */
  exit: { d: string; end: Point } | null;
  /** The wave is a vault's own: `signature` was an address. */
  signed: boolean;
}

type Wave = (x: number) => number;
type Drawn = Omit<ThreadGeometry, 'posts' | 'signed'>;

function knotsOn(fractions: readonly number[] | undefined, end: number, wy: Wave): Point[] {
  const xs = [...new Set((fractions ?? []).map((f) => r(clamp01(f) * end)))].sort((a, b) => a - b);
  return xs.map((x): Point => [x, r(wy(x))]);
}

function marksOn(axis: ThreadAxis, wy: Wave): Point[] {
  const inside = (axis.marks ?? []).filter((t) => t >= axis.from && t <= axis.to);
  const xs = [...new Set(inside.map((t) => courseX(t, axis)))].sort((a, b) => a - b);
  return xs.map((x): Point => [x, r(wy(x))]);
}

/** From the gate (gx, gy) to the branch end; the curve keeps its shape when the gate moves along the axis. */
function branch(gx: number, gy: number, y: number): string {
  const k = (BRANCH_END_X - gx) / (BRANCH_END_X - GATE_X);
  return `M${gx} ${gy} C${r(gx + 60 * k)} ${gy} ${r(gx + 106 * k)} ${y} ${BRANCH_END_X} ${y}`;
}

/** How far before the gate the recovery exit leaves the course. */
export const EXIT_LEAD = 120;

/**
 * The dashed recovery exit: off the course EXIT_LEAD before the gate, up to near the top edge, ending before the
 * gate's arch, so it reads as another way out of the vault than the heirs' gate.
 */
function exitPath(gateX: number, wy: Wave): { d: string; end: Point } {
  const x0 = Math.max(24, gateX - EXIT_LEAD);
  const y0 = r(wy(x0));
  const end: Point = [r(Math.max(x0 + 48, gateX - 36)), 12];
  return { d: `M${r(x0)} ${y0} C${r(x0 + 40)} ${y0} ${r(end[0] - 30)} ${end[1]} ${end[0]} ${end[1]}`, end };
}

/** Three strands from x0 to x1 that part from the thread and meet again at the gate. */
function frayStrands(x0: number, x1: number, wy: Wave, samples: number): string[] {
  return [-1, 0, 1].map((side) =>
    smoothPath(
      Array.from({ length: samples + 1 }, (_, i): Point => {
        const x = x0 + ((x1 - x0) * i) / samples;
        return [x, wy(x) + side * FRAY_SPREAD * Math.sin((Math.PI * i) / samples)];
      }),
    ),
  );
}

export function threadGeometry(state: ThreadState, input: ThreadInput = {}): ThreadGeometry {
  const sig = input.signature ? threadSignature(input.signature) : null;
  const g = draw(state, input, sig);
  return { ...g, posts: g.gate ? postsOf(input.posts) : null, signed: sig !== null };
}

/** Everything but the posts, on the vault's own wave when `sig` is set. */
function draw(state: ThreadState, input: ThreadInput, sig: ThreadSignature | null): Drawn {
  const wy: Wave = (x) => waveY(x, sig);
  const seg = (x0: number, x1: number): string => waveSegment(x0, x1, undefined, sig);
  const samples = sig ? SIGNED_SAMPLES : SAMPLES;
  const axis = input.axis ? drawnAxis(input.axis) : undefined;
  const gateX = axis?.releaseAt != null ? courseX(axis.releaseAt, axis) : GATE_X;
  const gateY = r(wy(gateX));
  const base: Drawn = {
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
    exit: null,
  };
  const knotsAt = (end: number): Point[] => (axis ? marksOn(axis, wy) : knotsOn(input.knots, end, wy));
  const withPending = (g: Drawn): Drawn => ({
    ...g,
    pending: input.pendingKnot && g.now ? g.now : null,
  });

  if ((state === 'active' || state === 'grace') && axis) {
    const nowX = base.nowX;
    // Outside the axis "now" would stand at an edge and tell the wrong time: it is left out, like a mark.
    const now: Point | null = axis.now >= axis.from && axis.now <= axis.to ? [nowX, r(wy(nowX))] : null;
    const alarmX = axis.alarmAt != null ? courseX(axis.alarmAt, axis) : gateX;
    if (state === 'active') {
      // Nothing past the gate is lit, also where the alarm would come later (a gate cut short to a story's release).
      const litTo = Math.min(alarmX, gateX);
      return withPending({
        ...base,
        track: seg(0, VIEW.w),
        lit: seg(0, VIEW.w),
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
      track: seg(0, x0),
      lit: seg(0, x0),
      litFrom: Math.min(nowX, x1),
      litTo: x1,
      now,
      knots: knotsAt(x0),
      gate: [gateX, gateY],
      fibers: frayStrands(x0, x1, wy, samples),
    });
  }

  if (state === 'active' || state === 'grace') {
    const end = state === 'grace' ? FRAY_X : VIEW.w;
    const left = input.remaining === undefined ? 1 : Number.isNaN(input.remaining) ? 1 : clamp01(input.remaining);
    const xNow = r(end * (1 - left));
    const fy = r(wy(FRAY_X));
    return withPending({
      ...base,
      track: seg(0, end),
      lit: seg(0, end),
      litFrom: xNow,
      // In grace the window reaches past FRAY_X, over the strands.
      litTo: VIEW.w,
      now: left > 0 ? [xNow, r(wy(xNow))] : null,
      nowX: xNow,
      knots: knotsOn(input.knots, end, wy),
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
    const by = r(wy(bx));
    const [ex, ey] = RECOVERY_END;
    // The curve keeps its shape wherever the bend stands, like a branch from the gate.
    const k = (ex - bx) / (ex - BEND_X);
    return {
      ...base,
      lit: `${seg(0, bx)} C${r(bx + 90 * k)} ${by} ${r(ex - 70 * k)} ${ey} ${ex} ${ey}`,
      // Past the bend the course is a ghost: a mark there is left out.
      knots: knotsAt(bx).filter(([x]) => x <= bx),
      gate: timed ? [bx, by] : null,
      ghost: seg(bx, VIEW.w),
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
      lit: seg(0, gateX),
      // The course ends at the gate and the branches take over: a mark past the gate is left out.
      knots: knotsAt(gateX).filter(([x]) => x <= gateX),
      gate: [gateX, gateY],
      branches: ys.map((y, i) => ({ d: branch(gateX, gateY, y), width: widths[i], tone: tone(i) })),
      dots: ys.map((y, i) => ({ at: [BRANCH_END_X, y] as Point, tone: tone(i) })),
      exit: state === 'releasedInherit' && input.exit ? exitPath(gateX, wy) : null,
    };
  }

  // expired: a short thread that curls up.
  const ey = r(wy(BEND_X));
  return {
    ...base,
    lit: seg(0, BEND_X),
    // The thread ends in the curl: a mark past it is left out.
    knots: knotsAt(BEND_X).filter(([x]) => x <= BEND_X),
    curl: `M${BEND_X} ${ey} c36 0 64 -12 64 6 s-22 26 -38 12 s2 -22 18 -14 s6 10 -4 12`,
  };
}
