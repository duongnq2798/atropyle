import { hexToBytes } from './bytes';
import { and, andAll, mux, not, or, orAll, xor } from './gates';
import { Netlist, type BuiltCircuit, type RefSite, type RefSpec } from './netlist';
import { compile, type Program, type Resolver } from './sim';
import { buildGe4, buildKofN5 } from './subcircuits';

const ZERO_ADDR = '0x' + '00'.repeat(20);

export interface PolicyRefs {
  kofn: RefSpec;
  ge4: RefSpec;
}

/** Template REFs; deploy patches the real ATRO address and circuit ids in (NetlistPatch.sol). */
export const PLACEHOLDER_REFS: PolicyRefs = {
  kofn: { name: 'KofN5', cpu: ZERO_ADDR, id: 1n, nIn: 8, nOut: 1 },
  ge4: { name: 'Ge4', cpu: ZERO_ADDR, id: 2n, nIn: 8, nOut: 1 },
};

/** Index into the [kofnId, ge4Id] pair used by refTargets / NetlistPatch. */
export const REF_TARGET_INDEX: Record<string, number> = { KofN5: 0, Ge4: 1 };

/** AtropylePolicy v1, spec §3: LATCHes A, R, X (state bits 0, 1, 2); 23 inputs; outputs alarm, cancel, release. */
export function buildPolicy(refs: PolicyRefs = PLACEHOLDER_REFS): BuiltCircuit {
  const n = new Netlist('AtropylePolicy', 23);
  const A = n.latch();
  const R = n.latch();
  const X = n.latch();
  const idle = n.inputs(0, 4);
  const T = n.inputs(4, 4);
  const inh = n.inputs(8, 5);
  const rec = n.inputs(13, 5);
  const k = n.inputs(18, 3);
  const alive = n.input(21);
  const wd = n.input(22);

  const [inhQ] = n.ref(refs.kofn, [...inh, ...k]);
  const [recRaw] = n.ref(refs.kofn, [...rec, ...k]);
  const [late] = n.ref(refs.ge4, [...idle, ...T]);
  const recQ = and(n, recRaw, orAll(n, k));
  const maxed = andAll(n, idle);

  const notX = not(n, X.q);
  const live = and(n, notX, not(n, alive));
  const grace = and(n, A.q, not(n, R.q));
  const recp = and(n, A.q, R.q);
  const inhOk = or(n, inhQ, maxed);

  const aNext = mux(n, X.q, A.q, and(n, live, orAll(n, [grace, recQ, late])));
  const rNext = mux(n, X.q, R.q, and(n, live, recQ));
  const fire = andAll(n, [live, wd, or(n, and(n, recp, recQ), andAll(n, [grace, not(n, recQ), inhOk]))]);
  const xNext = or(n, X.q, fire);
  A.setD(aNext);
  R.setD(rNext);
  X.setD(xNext);

  const alarm = andAll(n, [notX, aNext, not(n, xNext), or(n, not(n, A.q), xor(n, rNext, R.q))]);
  const cancel = andAll(n, [notX, A.q, not(n, aNext)]);
  const release = and(n, notX, xNext);
  return n.finish([alarm, cancel, release]);
}

export interface PolicyBuild {
  kofn: BuiltCircuit;
  ge4: BuiltCircuit;
  policy: BuiltCircuit;
  resolve: Resolver;
  program: Program;
}

export function buildAll(): PolicyBuild {
  const kofn = buildKofN5();
  const ge4 = buildGe4();
  const policy = buildPolicy();
  const resolve: Resolver = (cpu, id) => {
    if (cpu.toLowerCase() !== ZERO_ADDR) throw new Error(`unknown cpu ${cpu}`);
    if (id === PLACEHOLDER_REFS.kofn.id) return kofn;
    if (id === PLACEHOLDER_REFS.ge4.id) return ge4;
    throw new Error(`unknown circuit ${id}`);
  };
  return { kofn, ge4, policy, resolve, program: compile(policy, resolve) };
}

/** Same operation as contracts/script/lib/NetlistPatch.sol: writes cpu and ids[target] into every REF site. */
export function patchRefs(bytes: Uint8Array, sites: RefSite[], cpu: string, ids: readonly [bigint, bigint]): Uint8Array {
  const addr = hexToBytes(cpu);
  if (addr.length !== 20) throw new Error('address must be 20 bytes');
  const out = bytes.slice();
  for (const s of sites) {
    if (out[s.offset - 1] !== 2) throw new Error('patch: offset');
    const idx = REF_TARGET_INDEX[s.target];
    if (idx === undefined) throw new Error(`patch: unknown target ${s.target}`);
    out.set(addr, s.offset);
    let id = ids[idx];
    for (let b = 7; b >= 0; b--) {
      out[s.offset + 20 + b] = Number(id & 0xffn);
      id >>= 8n;
    }
  }
  return out;
}
