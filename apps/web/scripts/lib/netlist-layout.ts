import { fileURLToPath } from 'node:url';
import type { Program } from '@atropyle/circuits';

/** The hero's drawing box. 520 high keeps the 26 inputs and latches of column 0 apart on a phone strip. */
export const WEAVE_VIEW = { w: 1200, h: 520 } as const;
export const GEOMETRY_FILE = fileURLToPath(new URL('../../src/home/netlist-geometry.ts', import.meta.url));

/** Input 21 of the policy is `alive`, the owner's check-in (circuits/src/policy.ts: `n.input(21)`). */
export const ALIVE_INPUT = 21;
/**
 * Room a column gets on top of its own unit: STEEP_ROOM per unit of the steepest wire that crosses into it, and
 * THREAD_ROOM per unit of the thread's own steepness there (rise per column over the inner height). Chosen on
 * screenshots (7C-T4 brief, variant G): steep fans flatten, and the thread swells instead of spiking.
 */
export const STEEP_ROOM = 8;
export const THREAD_ROOM = 24;
/** The phone strip shows this many columns, from the middle of the circuit (spec §18.4.3 Task 4). */
export const PHONE_COLUMNS = 12;

const PAD_X = 24;
const PAD_Y = 28;
const round = (v: number) => Math.round(v);
const round1 = (v: number) => Math.round(v * 10) / 10;

export interface NetlistGeometry {
  /** NAND layers: the deepest signal's depth. Columns are 0 … depths. */
  depths: number;
  /** NAND and LATCH ops of the program: the whole circuit the processor runs, sub-circuits inlined. */
  nands: number;
  latches: number;
  /** x, y of signals 2 … nSignals − 1 (0 and 1 are the constants), whole view units. */
  nodes: number[];
  /** x1, y1, x2, y2 and the depth of the target, for both inputs of every NAND, in op order. */
  wires: number[];
  /** The left edge, then the real path from `alive` to the release output, then the right edge. */
  thread: number[];
  /** The phone strip: the view x where the middle PHONE_COLUMNS columns start, and their width. */
  crop: { x: number; w: number };
}

/** Depth of every signal: inputs and latch outputs 0, a NAND one more than its deeper input. Ops are in run order. */
export function signalDepths(p: Program): Int32Array {
  const depth = new Int32Array(p.nSignals);
  for (let j = 0; j < p.ops.length; j += 4) {
    const out = p.ops[j + 1];
    depth[out] = p.ops[j] === 0 ? 1 + Math.max(depth[p.ops[j + 2]], depth[p.ops[j + 3]]) : 0;
  }
  return depth;
}

/** Both inputs of every NAND, as [source, target] pairs in op order. */
function nandWires(p: Program): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < p.ops.length; j += 4) {
    if (p.ops[j] !== 0) continue;
    out.push([p.ops[j + 2], p.ops[j + 1]], [p.ops[j + 3], p.ops[j + 1]]);
  }
  return out;
}

/**
 * Heights: one column per depth. Column 0 keeps signal order; every other column is sorted by the mean height of
 * each gate's two inputs and spread evenly, so wires flow instead of crossing at random.
 */
function heights(p: Program, depth: Int32Array, depths: number, view: { h: number }): Float64Array {
  const inputs = new Map<number, [number, number]>();
  for (let j = 0; j < p.ops.length; j += 4) if (p.ops[j] === 0) inputs.set(p.ops[j + 1], [p.ops[j + 2], p.ops[j + 3]]);
  const ys = new Float64Array(p.nSignals);
  const columns: number[][] = Array.from({ length: depths + 1 }, () => []);
  for (let s = 2; s < p.nSignals; s++) columns[depth[s]].push(s);
  const innerH = view.h - 2 * PAD_Y;
  for (let d = 0; d <= depths; d++) {
    const col = columns[d];
    if (d > 0) {
      const key = new Map<number, number>();
      for (const s of col) {
        const [a, b] = inputs.get(s) as [number, number];
        key.set(s, (ys[a] + ys[b]) / 2);
      }
      col.sort((a, b) => (key.get(a) as number) - (key.get(b) as number) || a - b);
    }
    col.forEach((s, i) => {
      ys[s] = PAD_Y + ((i + 0.5) / col.length) * innerH;
    });
  }
  return ys;
}

/** Rise per column skipped, over the inner height: how steep the wire from `src` to `out` is. */
function steepness(src: number, out: number, depth: Int32Array, ys: Float64Array, innerH: number): number {
  return Math.abs(ys[out] - ys[src]) / (depth[out] - depth[src]) / innerH;
}

/**
 * Column x: every column gets one unit of room, plus STEEP_ROOM times the steepest wire that crosses into it, plus
 * THREAD_ROOM times the thread's steepness there, so where wires climb far the column widens and they flatten. The
 * columns then share the inner width. Heights never depend on x, so the thread is known before this runs.
 */
function columnXs(
  wires: readonly [number, number][],
  chain: readonly number[],
  depth: Int32Array,
  ys: Float64Array,
  depths: number,
  view: { w: number; h: number },
): number[] {
  const innerH = view.h - 2 * PAD_Y;
  const steep = new Float64Array(depths + 1);
  const threadSteep = new Float64Array(depths + 1);
  for (const [src, out] of wires) {
    const r = steepness(src, out, depth, ys, innerH);
    for (let d = depth[src] + 1; d <= depth[out]; d++) steep[d] = Math.max(steep[d], r);
  }
  for (let i = 1; i < chain.length; i++) {
    const r = steepness(chain[i - 1], chain[i], depth, ys, innerH);
    for (let d = depth[chain[i - 1]] + 1; d <= depth[chain[i]]; d++) threadSteep[d] = Math.max(threadSteep[d], r);
  }
  const room = [0];
  for (let d = 1; d <= depths; d++) room.push(room[d - 1] + 1 + STEEP_ROOM * steep[d] + THREAD_ROOM * threadSteep[d]);
  const innerW = view.w - 2 * PAD_X;
  return room.map((r) => PAD_X + (r / room[depths]) * innerW);
}

/**
 * The real path from `from` to `to` over NAND wires with the least total vertical travel: the calmest line through
 * the circuit. Ops are in run order, so one pass relaxes every wire after its source. Ties keep the lower source.
 */
function calmestPath(
  p: Program,
  wires: readonly [number, number][],
  ys: Float64Array,
  from: number,
  to: number,
): number[] {
  const cost = new Float64Array(p.nSignals).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(p.nSignals).fill(-1);
  cost[from] = 0;
  for (const [src, out] of wires) {
    if (cost[src] === Number.POSITIVE_INFINITY) continue;
    const c = cost[src] + Math.abs(ys[out] - ys[src]);
    if (c < cost[out] || (c === cost[out] && src < prev[out])) {
      cost[out] = c;
      prev[out] = src;
    }
  }
  const chain: number[] = [];
  for (let s = to; s !== -1; s = prev[s]) chain.push(s);
  chain.reverse();
  if (chain[0] !== from) throw new Error(`no wire path from signal ${from} to signal ${to}`);
  return chain;
}

/** Deterministic: the same netlist gives the same file. */
export function netlistGeometry(p: Program, view: { w: number; h: number } = WEAVE_VIEW): NetlistGeometry {
  const depth = signalDepths(p);
  let depths = 0;
  for (let s = 2; s < p.nSignals; s++) depths = Math.max(depths, depth[s]);
  const wiresOf = nandWires(p);
  const ys = heights(p, depth, depths, view);
  const chain = calmestPath(p, wiresOf, ys, 2 + ALIVE_INPUT, p.outIdx[2]);
  const colX = columnXs(wiresOf, chain, depth, ys, depths, view);
  const x = (s: number) => round(colX[depth[s]]);
  const y = (s: number) => round(ys[s]);

  const nodes: number[] = [];
  for (let s = 2; s < p.nSignals; s++) nodes.push(x(s), y(s));
  const wires: number[] = [];
  for (const [src, out] of wiresOf) wires.push(x(src), y(src), x(out), y(out), depth[out]);

  const thread = [0, y(chain[0])];
  for (const s of chain) thread.push(x(s), y(s));
  thread.push(view.w, y(chain[chain.length - 1]));

  const first = Math.floor((depths + 1 - PHONE_COLUMNS) / 2);
  const left = (colX[first - 1] + colX[first]) / 2;
  const right = (colX[first + PHONE_COLUMNS - 1] + colX[first + PHONE_COLUMNS]) / 2;

  let nands = 0;
  let latches = 0;
  for (let j = 0; j < p.ops.length; j += 4) {
    if (p.ops[j] === 0) nands++;
    else latches++;
  }
  return { depths, nands, latches, nodes, wires, thread, crop: { x: round1(left), w: round1(right - left) } };
}

export function renderGeometryModule(g: NetlistGeometry, view: { w: number; h: number } = WEAVE_VIEW): string {
  const list = (a: readonly number[]) => `[${a.join(',')}]`;
  return [
    '// Generated by apps/web/scripts/geometry.ts from the policy netlist (buildAll().program of @atropyle/circuits).',
    '// Do not edit: run `npm run geometry -w apps/web`. test/unit/netlist-geometry.test.ts fails when it is stale.',
    `export const VIEW = { w: ${view.w}, h: ${view.h} } as const;`,
    '/** NAND layers; the columns are 0 … DEPTHS. */',
    `export const DEPTHS = ${g.depths};`,
    '/** Gates of the whole circuit the processor runs: the policy with its sub-circuits inlined. */',
    `export const NANDS = ${g.nands};`,
    `export const LATCHES = ${g.latches};`,
    '/** The phone strip: where the middle columns start in the view, and how wide they are. */',
    `export const CROP = { x: ${g.crop.x}, w: ${g.crop.w} } as const;`,
    '/** x, y of every signal but the two constants, in signal order. */',
    `export const NODES: readonly number[] = ${list(g.nodes)};`,
    '/** x1, y1, x2, y2 and the depth of the target, for both inputs of every NAND. */',
    `export const WIRES: readonly number[] = ${list(g.wires)};`,
    '/** The left edge, the calmest real path from the `alive` input to the release output, the right edge. */',
    `export const THREAD: readonly number[] = ${list(g.thread)};`,
    '',
  ].join('\n');
}
