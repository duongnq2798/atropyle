import { describe, expect, it } from 'vitest';
import { hexToBytes } from '../src/bytes';
import { Netlist, type BuiltCircuit } from '../src/netlist';
import { compile, lanes, runLanes, stepBytes, type CircuitSource, type Resolver } from '../src/sim';

const noRefs: Resolver = () => {
  throw new Error('no refs');
};
const CPU = '0x' + 'ab'.repeat(20);
const CIRCUIT_1: CircuitSource = { bytes: hexToBytes('0x000000020000030000000400000400000005000005'), nIn: 2, nOut: 1 };

function resolverOf(map: Record<string, BuiltCircuit>): Resolver {
  return (cpu, id) => {
    const c = map[`${cpu.toLowerCase()}:${id}`];
    if (!c) throw new Error(`missing ${cpu}:${id}`);
    return c;
  };
}

describe('compile + stepBytes', () => {
  it('evaluates on-chain circuit #1 (NAND)', () => {
    const p = compile(CIRCUIT_1, noRefs);
    expect(p).toMatchObject({ nIn: 2, nOut: 1, nState: 0, gateCount: 3 });
    for (let x = 0; x < 4; x++) {
      expect(stepBytes(p, new Uint8Array(0), Uint8Array.of(x)).out[0]).toBe(x === 3 ? 0 : 1);
    }
  });

  it('evaluates 32 lanes at once', () => {
    const p = compile(CIRCUIT_1, noRefs);
    const b = lanes(p);
    runLanes(p, new Int32Array(0), Int32Array.of(0xaaaaaaaa | 0, 0xcccccccc | 0), b);
    expect(b.out[0]).toBe(~(0xaaaaaaaa & 0xcccccccc));
  });

  it('LATCH outputs the previous state and samples d', () => {
    const n = new Netlist('toggle', 0);
    const l = n.latch();
    l.setD(n.nand(l.q, l.q));
    const p = compile(n.finish([l.q]), noRefs);
    expect(stepBytes(p, Uint8Array.of(0), new Uint8Array(0))).toEqual({ next: Uint8Array.of(1), out: Uint8Array.of(0) });
    expect(stepBytes(p, Uint8Array.of(1), new Uint8Array(0))).toEqual({ next: Uint8Array.of(0), out: Uint8Array.of(1) });
  });

  it('orders state slots by declaration, a REF adding the child state', () => {
    const h = new Netlist('Hold', 1);
    const hl = h.latch();
    hl.setD(h.input(0));
    const hold = h.finish([hl.q]);

    const n = new Netlist('parent', 3);
    const l0 = n.latch();
    l0.setD(n.input(0));
    const [r] = n.ref({ name: 'Hold', cpu: CPU, id: 7n, nIn: 1, nOut: 1 }, [n.input(1)]);
    const l2 = n.latch();
    l2.setD(n.input(2));
    const p = compile(n.finish([l0.q, r, l2.q]), resolverOf({ [`${CPU}:7`]: hold }));

    expect(p.nState).toBe(3);
    expect(p.gateCount).toBe(11); // parent: 2 LATCH + 6 NAND; Hold: 1 LATCH + 2 NAND
    const { next, out } = stepBytes(p, Uint8Array.of(0b010), Uint8Array.of(0b101));
    expect(out[0]).toBe(0b010);
    expect(next[0]).toBe(0b101);
  });

  it('matches a direct netlist when composed through REF', () => {
    const a = new Netlist('And', 2);
    const t = a.nand(a.input(0), a.input(1));
    const and = a.finish([a.nand(t, t)]);
    const n = new Netlist('viaRef', 2);
    const [o] = n.ref({ name: 'And', cpu: CPU, id: 1n, nIn: 2, nOut: 1 }, [n.input(0), n.input(1)]);
    const p = compile(n.finish([o]), resolverOf({ [`${CPU}:1`]: and }));
    for (let x = 0; x < 4; x++) {
      expect(stepBytes(p, new Uint8Array(0), Uint8Array.of(x)).out[0]).toBe(x === 3 ? 1 : 0);
    }
  });

  it('rejects malformed netlists like NetlistVM', () => {
    expect(() => compile({ bytes: Uint8Array.of(9), nIn: 0, nOut: 1 }, noRefs)).toThrow('bad opcode');
    expect(() => compile({ bytes: hexToBytes('0x00000002000009'), nIn: 1, nOut: 1 }, noRefs)).toThrow(
      'NAND: future signal',
    );
    expect(() => compile({ bytes: hexToBytes('0x00000000000000'), nIn: 0, nOut: 2 }, noRefs)).toThrow(
      'too few signals for outputs',
    );
    expect(() => compile({ bytes: hexToBytes('0x01000009'), nIn: 0, nOut: 1 }, noRefs)).toThrow(
      'LATCH d out of range',
    );
    expect(() => compile({ bytes: hexToBytes('0x0000'), nIn: 0, nOut: 1 }, noRefs)).toThrow('truncated');

    const sub = new Netlist('S', 1);
    const s = sub.finish([sub.input(0)]);
    const n = new Netlist('p', 2);
    const [o] = n.ref({ name: 'S', cpu: CPU, id: 3n, nIn: 2, nOut: 1 }, [n.input(0), n.input(1)]);
    expect(() => compile(n.finish([o]), resolverOf({ [`${CPU}:3`]: s }))).toThrow('REF: pin mismatch');
  });
});
