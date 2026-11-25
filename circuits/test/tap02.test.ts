import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes } from '../src/bytes';
import { compile, type Resolver, stepBytes } from '../src/sim';

// TAP-02 vectors, vendored byte for byte with their source and license in tap-02/README.md.
const FILE = join(import.meta.dirname, 'tap-02/vectors.json');
const SHA256 = '1a02f5cf991c130a22dc6cc6ee93d0f8fe0720afed081665fa8b8018aefd203b';

interface Ref {
  cpu: string;
  id: number;
  nIn: number;
  nOut: number;
  netlist: string;
}
interface Case {
  name: string;
  netlist: string;
  nIn: number;
  nOut: number;
  refs: Ref[];
}
interface Valid extends Case {
  nState: number;
  truthTable?: { inputs: string; outputs: string }[];
  beats?: { state: string; inputs: string; newState: string; outputs: string }[];
}
interface Vectors {
  format: string;
  chainVerified: boolean;
  valid: Valid[];
  illFormed: (Case & { reason: string })[];
  packingEdgeCases: { circuit: string; cases: { case: string; inputs: string; outputs: string }[] };
}

const raw = readFileSync(FILE);
const v = JSON.parse(raw.toString('utf8')) as Vectors;
/** The vectors write bit vectors as bare hex ("03aa", or "" for no bytes). */
const hex = (b: Uint8Array) => bytesToHex(b).slice(2);

function resolverOf(refs: Ref[]): Resolver {
  return (cpu, id) => {
    const r = refs.find((x) => x.cpu.toLowerCase() === cpu.toLowerCase() && BigInt(x.id) === id);
    if (!r) throw new Error(`REF target ${cpu}:${id} is not a registered circuit`);
    return { bytes: hexToBytes(r.netlist), nIn: r.nIn, nOut: r.nOut };
  };
}

const compileCase = (c: Case) =>
  compile({ bytes: hexToBytes(c.netlist), nIn: c.nIn, nOut: c.nOut }, resolverOf(c.refs));

describe('TAP-02 test vectors', () => {
  it('is the file TAP-02 publishes', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(SHA256);
    expect(v.format).toBe('tap-netlist-vectors/1');
    expect(v.valid.map((c) => c.name)).toEqual(['nand', 'constants', 'popcount8_3151', 'toggle', 'ref_with_state']);
    expect(v.illFormed).toHaveLength(8);
  });

  for (const c of v.valid) {
    it(`evaluates ${c.name} like the chain`, () => {
      const p = compileCase(c);
      expect(p.nState).toBe(c.nState);
      const rows = [...(c.truthTable ?? []), ...(c.beats ?? [])];
      expect(rows.length).toBeGreaterThan(0);
      for (const t of c.truthTable ?? []) {
        expect({ inputs: t.inputs, outputs: hex(stepBytes(p, new Uint8Array(0), hexToBytes(t.inputs)).out) }).toEqual(t);
      }
      for (const b of c.beats ?? []) {
        const r = stepBytes(p, hexToBytes(b.state), hexToBytes(b.inputs));
        expect({ ...b, newState: hex(r.next), outputs: hex(r.out) }).toEqual(b);
      }
    });
  }

  /** The error our compile gives for the reason TAP-02 names, so a case cannot pass on an unrelated error. */
  const rejection: Record<string, RegExp> = {
    unknown_opcode: /^bad opcode$/,
    truncated_record: /^truncated$/,
    nand_forward_reference: /^NAND: future signal$/,
    nOut_zero: /^no outputs$/,
    output_is_an_input: /^too few signals for outputs$/,
    more_outputs_than_elements: /^too few signals for outputs$/,
    ref_arity_mismatch: /^REF: pin mismatch$/,
    // compile asks the resolver for the target; here that is this test's resolverOf, which knows only the case's refs.
    ref_target_not_registered: /^REF target 0x[0-9a-f]{40}:\d+ is not a registered circuit$/i,
  };

  it('names an expected error for every ill-formed case', () => {
    expect(Object.keys(rejection).sort()).toEqual(v.illFormed.map((c) => c.name).sort());
  });

  for (const c of v.illFormed) {
    it(`rejects ${c.name} (${c.reason})`, () => {
      expect(() => compileCase(c)).toThrow(rejection[c.name]);
    });
  }

  it('reads inputs leniently, as in TAP-02 §5', () => {
    const nand = v.valid.find((c) => c.name === v.packingEdgeCases.circuit) as Valid;
    const p = compileCase(nand);
    for (const t of v.packingEdgeCases.cases) {
      expect({ ...t, outputs: hex(stepBytes(p, new Uint8Array(0), hexToBytes(t.inputs)).out) }).toEqual(t);
    }
  });
});
