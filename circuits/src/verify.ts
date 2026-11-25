import { refStepCode } from './model';
import { violations } from './properties';
import { lanes, runLanes, type Program } from './sim';

/** Bit j (0..4) of the lane index, as a 32-lane word. */
const LANE = [0xaaaaaaaa | 0, 0xcccccccc | 0, 0xf0f0f0f0 | 0, 0xff00ff00 | 0, 0xffff0000 | 0];
/** 2^26 combinations / 32 lanes. */
const FULL_BLOCKS = 1 << 21;

export interface Failure {
  state: number;
  inputs: number;
  next: number;
  out: number;
  expectNext: number;
  expectOut: number;
  violations: number;
}

export interface VerifyReport {
  combos: number;
  mismatches: number;
  /** Violation count per property P1..P7. */
  violations: number[];
  firstFailures: Failure[];
  ms: number;
}

export interface VerifyOptions {
  maxFailures?: number;
  onProgress?: (done: number, total: number) => void;
  /**
   * Blocks between two onProgress calls: a positive whole number, 65 536 by default (32 calls for the full proof).
   * The last block always reports, so a run ends at done === total.
   */
  progressEvery?: number;
  /** Test hook: enumerate only the first `blocks` blocks of 32 combinations. */
  blocks?: number;
}

/**
 * Checks P1–P7 and P8 (equality with the reference model) for every (state, inputs).
 * combo = state | inputs << 3; block `blk` holds combos (blk << 5) .. (blk << 5) + 31, one per lane.
 */
export function verifyPolicy(p: Program, opts: VerifyOptions = {}): VerifyReport {
  if (p.nIn !== 23 || p.nOut !== 3 || p.nState !== 3) throw new Error('not a policy-shaped program');
  const t0 = performance.now();
  const blocks = opts.blocks ?? FULL_BLOCKS;
  const maxFailures = opts.maxFailures ?? 16;
  const every = opts.progressEvery ?? 0x10000;
  if (!Number.isSafeInteger(every) || every < 1) {
    throw new Error(`progressEvery must be a positive whole number, got ${every}`);
  }
  const buf = lanes(p);
  const state = Int32Array.of(LANE[0], LANE[1], LANE[2]);
  const inputs = new Int32Array(23);
  inputs[0] = LANE[3];
  inputs[1] = LANE[4];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const firstFailures: Failure[] = [];
  let mismatches = 0;

  for (let blk = 0; blk < blocks; blk++) {
    for (let i = 2; i < 23; i++) inputs[i] = (blk >>> (i - 2)) & 1 ? -1 : 0;
    runLanes(p, state, inputs, buf);
    const n0 = buf.next[0], n1 = buf.next[1], n2 = buf.next[2];
    const o0 = buf.out[0], o1 = buf.out[1], o2 = buf.out[2];
    for (let lane = 0; lane < 32; lane++) {
      const combo = (blk << 5) | lane;
      const s = combo & 7;
      const v = combo >>> 3;
      const next = ((n0 >>> lane) & 1) | (((n1 >>> lane) & 1) << 1) | (((n2 >>> lane) & 1) << 2);
      const out = ((o0 >>> lane) & 1) | (((o1 >>> lane) & 1) << 1) | (((o2 >>> lane) & 1) << 2);
      const code = refStepCode(s, v);
      const bad = code !== (next | (out << 3));
      const vio = violations(s, v, next, out);
      if (bad) mismatches++;
      for (let j = 0; vio !== 0 && j < 7; j++) if (vio & (1 << j)) counts[j]++;
      if ((bad || vio !== 0) && firstFailures.length < maxFailures) {
        firstFailures.push({ state: s, inputs: v, next, out, expectNext: code & 7, expectOut: code >>> 3, violations: vio });
      }
    }
    if (opts.onProgress && ((blk + 1) % every === 0 || blk + 1 === blocks)) opts.onProgress(blk + 1, blocks);
  }
  return { combos: blocks * 32, mismatches, violations: counts, firstFailures, ms: performance.now() - t0 };
}
