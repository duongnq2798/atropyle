// @vitest-environment node
import { readFileSync } from 'node:fs';
import { buildAll, stepBytes } from '@atropyle/circuits';
import { describe, expect, it } from 'vitest';
import {
  ALIVE_INPUT,
  GEOMETRY_FILE,
  netlistGeometry,
  PHONE_COLUMNS,
  renderGeometryModule,
} from '../../scripts/lib/netlist-layout';
import { CROP, DEPTHS, LATCHES, NANDS, NODES, THREAD, VIEW, WIRES } from '../../src/home/netlist-geometry';

const program = buildAll().program;
/** x, y of a signal (0 and 1 are the constants and have no node). */
const nodeOf = (s: number) => [NODES[(s - 2) * 2], NODES[(s - 2) * 2 + 1]];
/** Input bytes of the policy (23 inputs) with these input bits set. */
function inputBits(...set: number[]): Uint8Array {
  const b = new Uint8Array(3);
  for (const i of set) b[i >> 3] |= 1 << (i & 7);
  return b;
}

describe('hero geometry', () => {
  it('is the policy netlist of this repository (run `npm run geometry -w apps/web` after a circuit change)', () => {
    // facts.test.ts ties buildAll() to the netlist frozen on X Layer (POLICY_NETLIST_KECCAK); this ties the drawing
    // to buildAll().
    expect(readFileSync(GEOMETRY_FILE, 'utf8')).toBe(renderGeometryModule(netlistGeometry(program)));
  });

  it('counts every gate the processor runs, and draws every signal and both inputs of every NAND', () => {
    expect([DEPTHS, NANDS, LATCHES]).toEqual([39, 196, 3]);
    expect(NANDS + LATCHES).toBe(program.gateCount);
    expect(NODES).toHaveLength((program.nSignals - 2) * 2);
    expect(WIRES).toHaveLength(NANDS * 2 * 5);
    for (let i = 0; i < NODES.length; i += 2) {
      expect(NODES[i]).toBeGreaterThan(0);
      expect(NODES[i]).toBeLessThan(VIEW.w);
      expect(NODES[i + 1]).toBeGreaterThan(0);
      expect(NODES[i + 1]).toBeLessThan(VIEW.h);
    }
  });

  it('runs the thread from the alive input to the release output along real wires, from edge to edge', () => {
    expect(THREAD.slice(0, 2)).toEqual([0, THREAD[3]]);
    expect(THREAD.slice(2, 4)).toEqual(nodeOf(2 + ALIVE_INPUT));
    expect(THREAD.slice(-4, -2)).toEqual(nodeOf(program.outIdx[2]));
    expect(THREAD.slice(-2)).toEqual([VIEW.w, THREAD.at(-3)]);
    for (let i = 2; i < THREAD.length; i += 2) expect(THREAD[i]).toBeGreaterThan(THREAD[i - 2]);
    const wires = new Set<string>();
    for (let i = 0; i < WIRES.length; i += 5) wires.add(WIRES.slice(i, i + 4).join(','));
    for (let i = 4; i < THREAD.length - 2; i += 2) {
      expect(wires.has(THREAD.slice(i - 2, i + 2).join(',')), `thread segment ${i / 2 - 1}`).toBe(true);
    }
  });

  it('starts where the owner checks in: in grace with the inheritance due, only `alive` holds the release back', () => {
    // State: A set (grace). Inputs: idle 0–3 all set (maxed, so the inheritance is due), wd (22) set, k = 0.
    const grace = new Uint8Array([0b001]);
    const silent = stepBytes(program, grace, inputBits(0, 1, 2, 3, 22));
    const checkedIn = stepBytes(program, grace, inputBits(0, 1, 2, 3, 22, ALIVE_INPUT));
    const release = (out: Uint8Array) => (out[0] >> 2) & 1;
    expect(release(silent.out)).toBe(1);
    expect(release(checkedIn.out)).toBe(0);
  });

  it('gives the phone strip the middle PHONE_COLUMNS columns', () => {
    const columns = [...new Set(NODES.filter((_, i) => i % 2 === 0))].sort((a, b) => a - b);
    expect(columns).toHaveLength(DEPTHS + 1);
    const inside = columns.filter((x) => x > CROP.x && x < CROP.x + CROP.w);
    expect(inside).toHaveLength(PHONE_COLUMNS);
    expect(columns.indexOf(inside[0])).toBe((DEPTHS + 1 - PHONE_COLUMNS) / 2);
  });
});
