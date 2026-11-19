import {
  type CircuitSource,
  compile,
  listRefs,
  type PolicyInputs,
  type Program,
  packInputs,
  type RefTarget,
  refStep,
  stepBytes,
} from '@atropyle/circuits';
import type { Address } from 'viem';
import { AtropyleError } from '../errors';

export type EngineKind = 'netlist' | 'model';

export interface PolicyEngine {
  readonly kind: EngineKind;
  step(state: number, inputs: PolicyInputs): { next: number; out: number };
}

/** The reference model. Only used when the CPU exposes no netlist (devnet MockPolicyCPU). */
export function modelEngine(): PolicyEngine {
  return { kind: 'model', step: (s, i) => refStep(s, i) };
}

/** Runs the compiled on-chain netlist with the exact NetlistVM bit layout. */
export function programEngine(program: Program): PolicyEngine {
  if (program.nIn !== 23 || program.nOut !== 3 || program.nState !== 3) {
    throw new AtropyleError('POLICY_MISMATCH', {
      message: `The policy circuit has shape ${program.nIn}/${program.nOut}/${program.nState}; expected 23/3/3.`,
    });
  }
  return {
    kind: 'netlist',
    step(state, inputs) {
      const w = packInputs(inputs);
      const r = stepBytes(
        program,
        Uint8Array.of(state & 7),
        Uint8Array.of(w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff),
      );
      return { next: r.next[0] & 7, out: r.out[0] & 7 };
    },
  };
}

export interface NetlistSource {
  netlist(id: bigint): Promise<Uint8Array>;
  info(id: bigint): Promise<{ nIn: number; nOut: number }>;
}

export interface FetchedPolicy {
  program: Program;
  /** Every netlist that was fetched, keyed by circuit id (policy included). */
  netlists: Map<bigint, Uint8Array>;
}

const MAX_CIRCUITS = 8;

function mismatch(message: string, cause?: unknown): AtropyleError {
  return new AtropyleError('POLICY_MISMATCH', { message, cause });
}

function refsOf(bytes: Uint8Array): RefTarget[] {
  try {
    return listRefs(bytes);
  } catch (e) {
    throw mismatch(`A policy netlist is malformed: ${(e as Error).message}.`, e);
  }
}

/**
 * Fetches the policy netlist and every REF target on the same CPU, then compiles. null = no netlist.
 * Errors thrown by `src` (RPC failures) pass through untouched: only a netlist that was read and is wrong is a
 * POLICY_MISMATCH, never a flaky connection.
 */
export async function fetchPolicyProgram(
  cpu: Address,
  policyId: bigint,
  src: NetlistSource,
): Promise<FetchedPolicy | null> {
  const root = await src.netlist(policyId);
  if (root.length === 0) return null;
  const cpuKey = cpu.toLowerCase();
  const info = await src.info(policyId);
  const netlists = new Map<bigint, Uint8Array>([[policyId, root]]);
  const shapes = new Map<bigint, { nIn: number; nOut: number }>();
  const queue: Uint8Array[] = [root];
  while (queue.length > 0) {
    for (const ref of refsOf(queue.shift() as Uint8Array)) {
      if (ref.cpu !== cpuKey) throw mismatch(`A REF points to another CPU (${ref.cpu}).`);
      if (netlists.has(ref.id)) continue;
      if (netlists.size >= MAX_CIRCUITS) throw mismatch('The policy references too many sub-circuits.');
      const bytes = await src.netlist(ref.id);
      netlists.set(ref.id, bytes);
      shapes.set(ref.id, { nIn: ref.nIn, nOut: ref.nOut });
      queue.push(bytes);
    }
  }
  const resolve = (c: string, id: bigint): CircuitSource => {
    const bytes = netlists.get(id);
    const shape = shapes.get(id);
    if (!bytes || !shape || c.toLowerCase() !== cpuKey) throw new Error(`unresolved REF ${id}`);
    return { bytes, ...shape };
  };
  try {
    return { program: compile({ bytes: root, nIn: info.nIn, nOut: info.nOut }, resolve), netlists };
  } catch (e) {
    throw mismatch(`The on-chain policy netlist could not be compiled: ${(e as Error).message}.`, e);
  }
}
