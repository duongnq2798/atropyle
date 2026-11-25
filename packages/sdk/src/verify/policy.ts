import {
  buildAll,
  deployedNetlists,
  type Failure,
  listRefs,
  type Program,
  verifyPolicy as proveProgram,
  type RefTarget,
} from '@atropyle/circuits';
import { type Address, type Hex, hexToBytes, keccak256, type PublicClient } from 'viem';
import { cpuAbi, factoryAbi } from '../abi/index';
import { sameAddress } from '../address';
import type { Deployment } from '../deployments/index';
import { AtropyleError, decodeError } from '../errors';
import { fetchPolicyProgram, type NetlistSource } from '../policy/engine';
import type { Warning } from '../types';
import { type CpuCheck, readCpuCheck } from './cpu';
import { evaluateP9, P9_VECTORS, type P9Reads, type P9Result, type ReadP9Options, readP9 } from './vectors';

export const SINGLE_RPC_WARNING: Warning = {
  code: 'SINGLE_RPC',
  message:
    'Only one RPC operator was used, so a dishonest RPC could have shown different data. Use two independent operators for a real check.',
};

/** X Layer mainnet: a deployment there must record its circuits, so there is something to compare against. */
export const MAINNET_CHAIN_ID = 196;

export interface BundleNetlist {
  id: bigint;
  bytes: Hex;
  nIn: number;
  nOut: number;
  nState: number;
  gateCount: number;
}

/** Everything verifyPolicy reads, at one quorum block. Plain data, so it can be posted to a Web Worker. */
export interface PolicyBundle {
  chainId: number;
  blockNumber: bigint;
  rpcs: number;
  factory: Address;
  cpu: Address;
  policyId: bigint;
  expected: {
    cpu: Address;
    policyId: bigint;
    kofn5: bigint | null;
    ge4: bigint | null;
    keccak: { policy: Hex; kofn5: Hex; ge4: Hex } | null;
  };
  /** The policy netlist first, then the REF targets in discovery order. */
  netlists: BundleNetlist[];
  cpuCheck: CpuCheck | null;
  /** The processor's own step() on the P9 vectors; null (or absent) when the caller gave no operators. */
  p9?: P9Reads | null;
}

export type PropertyName = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';
export interface PropertyResult {
  ok: boolean;
  violations: number;
}

export interface NetlistReport {
  id: bigint;
  role: 'policy' | 'kofn5' | 'ge4' | 'other';
  keccak: Hex;
  gates: number;
  /** keccak256 equals the bytes built from this repository's circuits source. */
  matchesSource: boolean;
  /** keccak256 equals deployments/<chain>.json; null when the deployment records none. */
  matchesDeployment: boolean | null;
}

export interface PolicyVerification {
  ok: boolean;
  properties: Record<PropertyName, PropertyResult>;
  combos: number;
  ms: number;
  netlists: NetlistReport[];
  cpu: Address;
  policyId: bigint;
  beaconFrozen: boolean | null;
  cpuCheck: CpuCheck | null;
  /** P9: the simulator against the processor's step() by eth_call; null when the bundle carries no P9 reads. */
  p9: P9Result | null;
  chainId: number;
  blockNumber: bigint;
  rpcs: number;
  /** Human-readable reasons when ok is false. */
  issues: string[];
  firstFailures: Failure[];
  warnings: Warning[];
}

export interface VerifyPolicyOptions {
  onProgress?: (done: number, total: number) => void;
  /** Test hook: enumerate only `blocks` × 32 combinations. Omit for the full 2^26 proof. */
  blocks?: number;
  /** Seed of the P9 vectors (a number, nothing to do with a wallet), 0 to 2^64 - 1. Omitted: a random one, in `p9.seed`. */
  p9Seed?: bigint;
}

export interface ReadPolicyBundleOptions {
  /** Run P9: one client per independent operator, each asked on its own, and the seed of the vectors. */
  p9?: { operators: readonly PublicClient[]; seed: bigint } & ReadP9Options;
}

const MAX_NETLISTS = 8;
const NAMES: PropertyName[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];

export async function readPolicyBundle(
  c: PublicClient,
  d: Deployment,
  rpcs: number,
  o: ReadPolicyBundleOptions = {},
): Promise<PolicyBundle> {
  try {
    const blockNumber = await c.getBlockNumber();
    const f = { address: d.factory, abi: factoryAbi, blockNumber } as const;
    const [cpu, policyId] = await Promise.all([
      c.readContract({ ...f, functionName: 'cpu' }),
      c.readContract({ ...f, functionName: 'policyId' }),
    ]);
    const at = { address: cpu, abi: cpuAbi, blockNumber } as const;
    const netlists: BundleNetlist[] = [];
    const queue: bigint[] = [policyId];
    const seen = new Set<bigint>();
    while (queue.length > 0 && netlists.length < MAX_NETLISTS) {
      const id = queue.shift() as bigint;
      if (seen.has(id)) continue;
      seen.add(id);
      const [bytes, info] = await Promise.all([
        c.readContract({ ...at, functionName: 'netlist', args: [id] }),
        c.readContract({ ...at, functionName: 'circuitInfo', args: [id] }),
      ]);
      const [nIn, nOut, nState, gateCount] = info.map(Number);
      netlists.push({ id, bytes, nIn, nOut, nState, gateCount });
      if (bytes === '0x') continue;
      try {
        for (const r of listRefs(hexToBytes(bytes))) if (sameAddress(r.cpu, cpu)) queue.push(r.id);
      } catch {
        // malformed bytes: evaluatePolicyBundle reports them
      }
    }
    const cpuCheck = d.tapeout ? await readCpuCheck(c, d, cpu, blockNumber) : null;
    // P9 needs a netlist to simulate: a processor without one (the devnet stand-in) is POLICY_UNAVAILABLE anyway.
    const root = netlists.find((n) => n.id === policyId);
    const p9 =
      o.p9 && root && root.bytes !== '0x'
        ? await readP9(o.p9.operators, cpu, policyId, blockNumber, o.p9.seed, o.p9)
        : null;
    return {
      chainId: d.chainId,
      blockNumber,
      rpcs,
      factory: d.factory,
      cpu,
      policyId,
      expected: {
        cpu: d.cpu,
        policyId: d.policyId,
        kofn5: d.circuits?.kofn5 ?? null,
        ge4: d.circuits?.ge4 ?? null,
        keccak: d.circuits?.netlistKeccak ?? null,
      },
      netlists,
      cpuCheck,
      p9,
    };
  } catch (e) {
    throw decodeError(e);
  }
}

/** Spec §5.4 steps 2-5 on a bundle. CPU-heavy (2^26 combinations): run it in a Web Worker in browsers. */
export async function evaluatePolicyBundle(b: PolicyBundle, o: VerifyPolicyOptions = {}): Promise<PolicyVerification> {
  const t0 = performance.now();
  const issues: string[] = [];
  const root = b.netlists.find((n) => n.id === b.policyId);
  if (!root || root.bytes === '0x') {
    throw new AtropyleError('POLICY_UNAVAILABLE', { details: { cpu: b.cpu, policyId: String(b.policyId) } });
  }
  if (!sameAddress(b.cpu, b.expected.cpu)) {
    issues.push(`factory.cpu() is ${b.cpu}, but the deployment records ${b.expected.cpu}`);
  }
  if (b.policyId !== b.expected.policyId) {
    issues.push(`factory.policyId() is ${b.policyId}, but the deployment records ${b.expected.policyId}`);
  }
  // On mainnet nothing may be left to trust: without recorded circuit ids and hashes the netlists are only compared
  // with this repository's source, not with what was deployed.
  if (
    b.chainId === MAINNET_CHAIN_ID &&
    (b.expected.kofn5 === null || b.expected.ge4 === null || b.expected.keccak === null)
  ) {
    issues.push('the deployment records no circuit ids or netlist hashes, which a mainnet deployment must have');
  }
  if (root.nIn !== 23 || root.nOut !== 3 || root.nState !== 3) {
    issues.push(`the policy circuit has shape ${root.nIn}/${root.nOut}/${root.nState}; expected 23/3/3`);
  }

  // REF ids by role: match on-chain REF sites with the source template by byte offset.
  const src = buildAll();
  let refs: RefTarget[] = [];
  try {
    refs = listRefs(hexToBytes(root.bytes));
  } catch (e) {
    issues.push(`the policy netlist is malformed (${(e as Error).message})`);
  }
  if (refs.length !== src.policy.refs.length) {
    issues.push(`the policy has ${refs.length} REFs; the source has ${src.policy.refs.length}`);
  }
  const ids: Record<'KofN5' | 'Ge4', bigint | null> = { KofN5: null, Ge4: null };
  for (const site of src.policy.refs) {
    const r = refs.find((x) => x.offset === site.offset);
    if (!r) {
      issues.push(`no REF at byte ${site.offset}`);
      continue;
    }
    if (!sameAddress(r.cpu, b.cpu)) issues.push(`the REF at byte ${site.offset} points to another CPU (${r.cpu})`);
    const target = site.target as 'KofN5' | 'Ge4';
    if (ids[target] === null) ids[target] = r.id;
    else if (ids[target] !== r.id) issues.push(`REFs to ${target} use different circuit ids`);
  }
  if (ids.KofN5 === null) issues.push('the policy has no REF to KofN5');
  if (ids.Ge4 === null) issues.push('the policy has no REF to Ge4');
  if (ids.KofN5 !== null && ids.KofN5 === ids.Ge4) issues.push('KofN5 and Ge4 use the same circuit id');
  if (b.expected.kofn5 !== null && ids.KofN5 !== b.expected.kofn5) {
    issues.push(`KofN5 is circuit ${ids.KofN5}; expected ${b.expected.kofn5}`);
  }
  if (b.expected.ge4 !== null && ids.Ge4 !== b.expected.ge4) {
    issues.push(`Ge4 is circuit ${ids.Ge4}; expected ${b.expected.ge4}`);
  }

  // Step 4: compare every netlist with the bytes built from this repository.
  const source = ids.KofN5 !== null && ids.Ge4 !== null ? deployedNetlists(b.cpu, [ids.KofN5, ids.Ge4]) : null;
  const netlists: NetlistReport[] = b.netlists.map((n) => {
    const role: NetlistReport['role'] =
      n.id === b.policyId ? 'policy' : n.id === ids.KofN5 ? 'kofn5' : n.id === ids.Ge4 ? 'ge4' : 'other';
    const keccak = keccak256(n.bytes);
    const expected = role === 'other' ? undefined : source?.[role];
    const recorded = role === 'other' ? null : (b.expected.keccak?.[role] ?? null);
    return {
      id: n.id,
      role,
      keccak,
      gates: n.gateCount,
      matchesSource: expected !== undefined && keccak === keccak256(expected),
      matchesDeployment: recorded === null ? null : recorded.toLowerCase() === keccak.toLowerCase(),
    };
  });
  for (const n of netlists) {
    if (!n.matchesSource) issues.push(`netlist ${n.id} (${n.role}) does not match the source in this repository`);
    if (n.matchesDeployment === false) {
      issues.push(`netlist ${n.id} (${n.role}) does not match the hash in the deployment file`);
    }
  }

  // Step 3: compile with a resolver over the bundle, then enumerate every (state, input).
  const byId = new Map(b.netlists.map((n) => [n.id, n]));
  const sourceOf: NetlistSource = {
    netlist: async (id) => hexToBytes(byId.get(id)?.bytes ?? '0x'),
    info: async (id) => {
      const n = byId.get(id);
      if (!n) throw new AtropyleError('POLICY_MISMATCH', { message: `Circuit ${id} is missing from the bundle.` });
      return { nIn: n.nIn, nOut: n.nOut };
    },
  };
  const properties = Object.fromEntries(NAMES.map((p) => [p, { ok: false, violations: 0 }])) as Record<
    PropertyName,
    PropertyResult
  >;
  let combos = 0;
  let firstFailures: Failure[] = [];
  let program: Program | null = null;
  try {
    const fetched = await fetchPolicyProgram(b.cpu, b.policyId, sourceOf);
    if (!fetched) throw new AtropyleError('POLICY_UNAVAILABLE');
    program = fetched.program;
    if (fetched.program.gateCount !== root.gateCount) {
      issues.push(`the compiled policy has ${fetched.program.gateCount} gates; circuitInfo reports ${root.gateCount}`);
    }
    const report = proveProgram(fetched.program, { onProgress: o.onProgress, blocks: o.blocks, maxFailures: 16 });
    combos = report.combos;
    firstFailures = report.firstFailures;
    report.violations.forEach((v, i) => {
      properties[NAMES[i]] = { ok: v === 0, violations: v };
    });
    properties.P8 = { ok: report.mismatches === 0, violations: report.mismatches };
  } catch (e) {
    issues.push(`the policy could not be checked: ${(e as Error).message}`);
  }
  // On mainnet the frozen-beacon check is what ties this proof to the code that runs the netlists: it cannot be skipped.
  if (b.chainId === MAINNET_CHAIN_ID && b.cpuCheck === null) {
    issues.push('the deployment records no TapeOut info, so the frozen CPU could not be checked');
  }
  if (b.cpuCheck && !b.cpuCheck.ok) issues.push('the CPU is not the frozen Atropyle processor (see cpuCheck)');
  // On mainnet the processor's runtime code must match the hashes pinned in this SDK (verify/pins.ts).
  if (b.chainId === MAINNET_CHAIN_ID && b.cpuCheck && b.cpuCheck.code.matches === null) {
    issues.push(`this SDK pins no code hashes for the CPU ${b.cpu}, so its code could not be checked`);
  }
  if (b.cpuCheck?.code.matches === false) {
    issues.push(
      'the runtime code of the CPU or of its implementation differs from the pinned hashes (see cpuCheck.code)',
    );
  }

  // P9: the simulator above against the processor's own step(), on every operator.
  const p9 = b.p9 ? evaluateP9(program, b.p9) : null;
  if (p9 && !p9.ok && program) {
    if (p9.vectors !== P9_VECTORS) issues.push(`P9 ran ${p9.vectors} vectors; expected ${P9_VECTORS}`);
    if (p9.operators.length === 0) issues.push('P9 asked no RPC operator');
    for (const op of p9.operators) {
      if (op.matched < p9.vectors) {
        issues.push(
          `P9: ${p9.vectors - op.matched} of ${p9.vectors} vectors differ between the simulator and step() on RPC operator #${op.operator}`,
        );
      }
    }
  }
  const allProps = NAMES.every((p) => properties[p].ok);
  return {
    ok: issues.length === 0 && allProps && (p9 === null || p9.ok),
    properties,
    combos,
    ms: Math.round(performance.now() - t0),
    netlists,
    cpu: b.cpu,
    policyId: b.policyId,
    beaconFrozen: b.cpuCheck?.beaconFrozen ?? null,
    cpuCheck: b.cpuCheck,
    p9,
    chainId: b.chainId,
    blockNumber: b.blockNumber,
    rpcs: b.rpcs,
    issues,
    firstFailures,
    warnings: b.rpcs < 2 ? [SINGLE_RPC_WARNING] : [],
  };
}
