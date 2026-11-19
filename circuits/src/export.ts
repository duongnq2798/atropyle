import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bytesToHex } from './bytes';
import type { BuiltCircuit } from './netlist';
import { buildAll, REF_TARGET_INDEX } from './policy';
import { compile, stepBytes, type Program } from './sim';

export interface CircuitJson {
  name: string;
  netlist: string;
  nIn: number;
  nOut: number;
  nand: number;
  latch: number;
  gateCount: number;
  refOffsets: number[];
  refTargets: number[];
}

export interface VectorsJson {
  states: number[];
  inputs: number[];
  next: number[];
  out: number[];
}

export function circuitJson(c: BuiltCircuit, gateCount: number): CircuitJson {
  return {
    name: c.name,
    netlist: bytesToHex(c.bytes),
    nIn: c.nIn,
    nOut: c.nOut,
    nand: c.nand,
    latch: c.latch,
    gateCount,
    refOffsets: c.refs.map((r) => r.offset),
    refTargets: c.refs.map((r) => {
      const i = REF_TARGET_INDEX[r.target];
      if (i === undefined) throw new Error(`unknown REF target ${r.target}`);
      return i;
    }),
  };
}

export function xorshift32(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

/** Deterministic samples from the simulator: state i % 8, random 23-bit inputs. */
export function makeVectors(p: Program, count = 512): VectorsJson {
  const rand = xorshift32(0x9e3779b9);
  const v: VectorsJson = { states: [], inputs: [], next: [], out: [] };
  for (let i = 0; i < count; i++) {
    const s = i % 8;
    const w = rand() & 0x7fffff;
    const r = stepBytes(p, Uint8Array.of(s), Uint8Array.of(w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff));
    v.states.push(s);
    v.inputs.push(w);
    v.next.push(r.next[0]);
    v.out.push(r.out[0]);
  }
  return v;
}

export function exportAll(dir: string): { dir: string; policyGateCount: number } {
  const b = buildAll();
  mkdirSync(dir, { recursive: true });
  const write = (file: string, data: unknown) => writeFileSync(join(dir, file), JSON.stringify(data, null, 2) + '\n');
  write('kofn5.json', circuitJson(b.kofn, compile(b.kofn, b.resolve).gateCount));
  write('ge4.json', circuitJson(b.ge4, compile(b.ge4, b.resolve).gateCount));
  write('policy.template.json', circuitJson(b.policy, b.program.gateCount));
  write('vectors.json', makeVectors(b.program));
  return { dir, policyGateCount: b.program.gateCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  const r = exportAll(resolvePath(process.argv[2] ?? '../contracts/circuits'));
  console.log(`wrote ${r.dir} (policy gateCount ${r.policyGateCount})`);
}
