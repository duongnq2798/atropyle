import { addrAt, getBit, setBit, u24, u64 } from './bytes';

export interface CircuitSource {
  bytes: Uint8Array;
  nIn: number;
  nOut: number;
}

export type Resolver = (cpu: string, id: bigint) => CircuitSource;

export interface Program {
  nIn: number;
  nOut: number;
  nState: number;
  nSignals: number;
  /** Stride 4: [0, out, a, b] = NAND, [1, out, slot, 0] = LATCH (out = previous state[slot]). */
  ops: Int32Array;
  /** Flat signal sampled into each state slot after the pass. */
  latchD: Int32Array;
  outIdx: Int32Array;
  /** Flattened NAND + LATCH count, equal to circuitInfo().gateCount on chain. */
  gateCount: number;
}

export interface LaneBuffers {
  v: Int32Array;
  next: Int32Array;
  out: Int32Array;
}

const MAX_REF_DEPTH = 16;

/** Flattens a netlist (recursively through REF) into a single straight-line program. */
export function compile(src: CircuitSource, resolve: Resolver): Program {
  const ops: number[] = [];
  const latchD: number[] = [];
  let nSignals = 2 + src.nIn;
  let gateCount = 0;

  function need(nl: Uint8Array, p: number, len: number): void {
    if (p + len > nl.length) throw new Error('truncated');
  }

  function emit(c: CircuitSource, ins: number[], depth: number): number[] {
    if (depth > MAX_REF_DEPTH) throw new Error('REF nesting too deep');
    const nl = c.bytes;
    const local: number[] = [0, 1, ...ins];
    const pending: Array<[number, number]> = [];
    let p = 0;
    while (p < nl.length) {
      const op = nl[p++];
      if (op === 0) {
        need(nl, p, 6);
        const a = u24(nl, p);
        const b = u24(nl, p + 3);
        p += 6;
        if (a >= local.length || b >= local.length) throw new Error('NAND: future signal');
        ops.push(0, nSignals, local[a], local[b]);
        local.push(nSignals++);
        gateCount++;
      } else if (op === 1) {
        need(nl, p, 3);
        const d = u24(nl, p);
        p += 3;
        const slot = latchD.length;
        latchD.push(-1);
        ops.push(1, nSignals, slot, 0);
        local.push(nSignals++);
        gateCount++;
        pending.push([slot, d]);
      } else if (op === 2) {
        need(nl, p, 30);
        const cpu = addrAt(nl, p);
        const id = u64(nl, p + 20);
        const rIn = nl[p + 28];
        const rOut = nl[p + 29];
        p += 30;
        need(nl, p, rIn * 3);
        const subIns: number[] = [];
        for (let k = 0; k < rIn; k++) {
          const s = u24(nl, p);
          p += 3;
          if (s >= local.length) throw new Error('REF: future signal');
          subIns.push(local[s]);
        }
        const sub = resolve(cpu, id);
        if (sub.nIn !== rIn || sub.nOut !== rOut) throw new Error('REF: pin mismatch');
        local.push(...emit(sub, subIns, depth + 1));
      } else {
        throw new Error('bad opcode');
      }
    }
    if (local.length < 2 + c.nIn + c.nOut) throw new Error('too few signals for outputs');
    for (const [slot, d] of pending) {
      if (d >= local.length) throw new Error('LATCH d out of range');
      latchD[slot] = local[d];
    }
    return local.slice(local.length - c.nOut);
  }

  const inputs = Array.from({ length: src.nIn }, (_, i) => 2 + i);
  const outs = emit(src, inputs, 0);
  return {
    nIn: src.nIn,
    nOut: src.nOut,
    nState: latchD.length,
    nSignals,
    ops: Int32Array.from(ops),
    latchD: Int32Array.from(latchD),
    outIdx: Int32Array.from(outs),
    gateCount,
  };
}

export function lanes(p: Program): LaneBuffers {
  return { v: new Int32Array(p.nSignals), next: new Int32Array(p.nState), out: new Int32Array(p.nOut) };
}

/** One step for 32 independent lanes: bit j of every word belongs to lane j. */
export function runLanes(p: Program, state: Int32Array, inputs: Int32Array, b: LaneBuffers): void {
  const v = b.v;
  const ops = p.ops;
  v[0] = 0;
  v[1] = -1;
  for (let i = 0; i < p.nIn; i++) v[2 + i] = inputs[i];
  for (let j = 0; j < ops.length; j += 4) {
    v[ops[j + 1]] = ops[j] === 0 ? ~(v[ops[j + 2]] & v[ops[j + 3]]) : state[ops[j + 2]];
  }
  for (let i = 0; i < p.nState; i++) b.next[i] = v[p.latchD[i]];
  for (let i = 0; i < p.nOut; i++) b.out[i] = v[p.outIdx[i]];
}

/** Single-lane step with the on-chain byte encoding (little-endian bit packing). */
export function stepBytes(p: Program, state: Uint8Array, inputs: Uint8Array): { next: Uint8Array; out: Uint8Array } {
  const st = new Int32Array(p.nState);
  const inp = new Int32Array(p.nIn);
  for (let i = 0; i < p.nState; i++) st[i] = getBit(state, i) ? -1 : 0;
  for (let i = 0; i < p.nIn; i++) inp[i] = getBit(inputs, i) ? -1 : 0;
  const b = lanes(p);
  runLanes(p, st, inp, b);
  const next = new Uint8Array((p.nState + 7) >> 3);
  const out = new Uint8Array((p.nOut + 7) >> 3);
  for (let i = 0; i < p.nState; i++) if (b.next[i] & 1) setBit(next, i);
  for (let i = 0; i < p.nOut; i++) if (b.out[i] & 1) setBit(out, i);
  return { next, out };
}
