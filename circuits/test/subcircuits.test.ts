import { describe, expect, it } from 'vitest';
import { getBit } from '../src/bytes';
import * as g from '../src/gates';
import { Netlist } from '../src/netlist';
import { compile, stepBytes, type Resolver } from '../src/sim';
import { buildGe4, buildKofN5 } from '../src/subcircuits';

const noRefs: Resolver = () => {
  throw new Error('no refs');
};

/** Builds a throwaway circuit; returns the gate NAND count and an evaluator over packed inputs. */
function circuit(nIn: number, build: (n: Netlist, ins: number[]) => number[]) {
  const n = new Netlist('t', nIn);
  const outs = build(n, n.inputs(0, nIn));
  const nand = n.nandCount;
  const p = compile(n.finish(outs), noRefs);
  return {
    nand,
    run(x: number): number[] {
      const r = stepBytes(p, new Uint8Array(0), Uint8Array.of(x & 0xff, (x >> 8) & 0xff));
      return outs.map((_, i) => getBit(r.out, i));
    },
  };
}

const bit = (x: number, i: number) => (x >> i) & 1;
const popcount = (x: number) => [0, 1, 2, 3, 4].reduce((c, i) => c + bit(x, i), 0);

describe('gates', () => {
  it('NOT/AND/OR/XOR/MUX truth tables and sizes', () => {
    const cases: Array<[string, number, (n: Netlist, i: number[]) => number, (x: number) => number, number]> = [
      ['not', 1, (n, i) => g.not(n, i[0]), (x) => 1 - bit(x, 0), 1],
      ['and', 2, (n, i) => g.and(n, i[0], i[1]), (x) => bit(x, 0) & bit(x, 1), 2],
      ['or', 2, (n, i) => g.or(n, i[0], i[1]), (x) => bit(x, 0) | bit(x, 1), 3],
      ['xor', 2, (n, i) => g.xor(n, i[0], i[1]), (x) => bit(x, 0) ^ bit(x, 1), 4],
      ['mux', 3, (n, i) => g.mux(n, i[0], i[1], i[2]), (x) => (bit(x, 0) ? bit(x, 1) : bit(x, 2)), 4],
      ['maj', 3, (n, i) => g.maj(n, i[0], i[1], i[2]), (x) => (bit(x, 0) + bit(x, 1) + bit(x, 2) >= 2 ? 1 : 0), 6],
    ];
    for (const [name, nIn, build, want, size] of cases) {
      const c = circuit(nIn, (n, i) => [build(n, i)]);
      expect(c.nand, name).toBe(size);
      for (let x = 0; x < 1 << nIn; x++) expect(c.run(x)[0], `${name}(${x})`).toBe(want(x));
    }
  });

  it('andAll/orAll handle empty and long lists', () => {
    expect(circuit(1, (n) => [g.andAll(n, [])]).run(0)[0]).toBe(1);
    expect(circuit(1, (n) => [g.orAll(n, [])]).run(1)[0]).toBe(0);
    const a4 = circuit(4, (n, i) => [g.andAll(n, i)]);
    const o4 = circuit(4, (n, i) => [g.orAll(n, i)]);
    for (let x = 0; x < 16; x++) {
      expect(a4.run(x)[0]).toBe(x === 15 ? 1 : 0);
      expect(o4.run(x)[0]).toBe(x === 0 ? 0 : 1);
    }
  });

  it('adders', () => {
    const fa = circuit(3, (n, i) => {
      const r = g.fullAdder(n, i[0], i[1], i[2]);
      return [r.sum, r.carry];
    });
    const ha = circuit(2, (n, i) => {
      const r = g.halfAdder(n, i[0], i[1]);
      return [r.sum, r.carry];
    });
    expect(fa.nand).toBe(9);
    expect(ha.nand).toBe(5);
    for (let x = 0; x < 8; x++) {
      const s = bit(x, 0) + bit(x, 1) + bit(x, 2);
      expect(fa.run(x)).toEqual([s & 1, s >> 1]);
    }
    for (let x = 0; x < 4; x++) expect(ha.run(x)).toEqual([bit(x, 0) ^ bit(x, 1), bit(x, 0) & bit(x, 1)]);
  });

  it('popcount5 (23 NAND)', () => {
    const c = circuit(5, (n, i) => g.popcount5(n, i));
    expect(c.nand).toBe(23);
    for (let x = 0; x < 32; x++) {
      const k = popcount(x);
      expect(c.run(x)).toEqual([bit(k, 0), bit(k, 1), bit(k, 2)]);
    }
  });

  it('geUnsigned for 3 and 4 bits', () => {
    const g3 = circuit(6, (n, i) => [g.geUnsigned(n, i.slice(0, 3), i.slice(3, 6))]);
    const g4 = circuit(8, (n, i) => [g.geUnsigned(n, i.slice(0, 4), i.slice(4, 8))]);
    expect(g3.nand).toBe(16);
    expect(g4.nand).toBe(23);
    for (let x = 0; x < 64; x++) expect(g3.run(x)[0]).toBe((x & 7) >= x >> 3 ? 1 : 0);
    for (let x = 0; x < 256; x++) expect(g4.run(x)[0]).toBe((x & 15) >= x >> 4 ? 1 : 0);
  });
});

describe('sub-circuits', () => {
  it('KofN5 = popcount(v0..v4) >= k0..k2, 41 NAND', () => {
    const c = buildKofN5();
    expect(c).toMatchObject({ name: 'KofN5', nIn: 8, nOut: 1, nand: 41, latch: 0, refs: [] });
    const p = compile(c, noRefs);
    for (let x = 0; x < 256; x++) {
      const want = popcount(x & 31) >= x >> 5 ? 1 : 0;
      expect(stepBytes(p, new Uint8Array(0), Uint8Array.of(x)).out[0]).toBe(want);
    }
  });

  it('Ge4 = a0..a3 >= b0..b3, 25 NAND', () => {
    const c = buildGe4();
    expect(c).toMatchObject({ name: 'Ge4', nIn: 8, nOut: 1, nand: 25, latch: 0, refs: [] });
    const p = compile(c, noRefs);
    for (let x = 0; x < 256; x++) {
      expect(stepBytes(p, new Uint8Array(0), Uint8Array.of(x)).out[0]).toBe((x & 15) >= x >> 4 ? 1 : 0);
    }
  });
});
