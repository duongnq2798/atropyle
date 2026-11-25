import { type Program, stepBytes } from '@atropyle/circuits';
import {
  type Address,
  bytesToHex,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  hexToBytes,
  keccak256,
  type PublicClient,
} from 'viem';
import { cpuAbi } from '../abi/index';
import { AtropyleError, decodeError, isContractAnswer } from '../errors';
import { codehashOf } from './cpu';
import { MULTICALL3, MULTICALL3_CODEHASH } from './pins';

/** Vectors per run: the design spec (§3.6) asks for 64 random eth_call checks of step(). */
export const P9_VECTORS = 64;
/**
 * step() calls per Multicall3 batch. eth_estimateGas of one policy step on X Layer was 643,185 gas (25 Nov 2026), so a
 * batch needs about 10.3M gas of the node's eth_call cap.
 */
export const P9_BATCH = 16;
export const MAX_SEED = 2n ** 64n - 1n;

const multicall3Abi = [
  {
    type: 'function',
    name: 'aggregate3',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const;

export interface P9Vector {
  /** 3 state bits. */
  state: number;
  /** The 23 input bits, as the vault packs them (PolicyCodec.toWord). */
  inputs: number;
}

/** What one operator's step() returned for one vector, or why it returned nothing usable. */
export type P9Answer = { next: Hex; out: Hex } | { error: 'reverted' | 'undecodable' };

export interface P9OperatorRead {
  /** 1-based, in the order of the verify transports. */
  operator: number;
  blockNumber: bigint;
  /** Multicall3, with its canonical code, carried at least one batch. */
  multicall: boolean;
  /** eth_call requests sent to this operator. */
  calls: number;
  answers: P9Answer[];
}

/** The chain side of P9, at the quorum block of the bundle. Plain data, so it can be posted to a Web Worker. */
export interface P9Reads {
  seed: bigint;
  vectors: P9Vector[];
  operators: P9OperatorRead[];
  /** Time spent reading, in milliseconds. */
  ms: number;
}

export interface P9Mismatch {
  operator: number;
  /** Position of the vector in the run, from 0. */
  index: number;
  state: number;
  inputs: number;
  /** newState and outputs of the simulator, packed as step() returns them. */
  expectNext: Hex;
  expectOut: Hex;
  /** What the processor returned; null with `error` when it returned nothing usable. */
  next: Hex | null;
  out: Hex | null;
  error: 'reverted' | 'undecodable' | 'missing' | null;
}

export interface P9OperatorResult {
  operator: number;
  blockNumber: bigint;
  multicall: boolean;
  calls: number;
  /** Vectors whose answer equals the simulator's, bit for bit. */
  matched: number;
}

/** P9: the local simulator against the processor's own step(), on seeded pseudo-random vectors, per operator. */
export interface P9Result {
  ok: boolean;
  seed: bigint;
  vectors: number;
  operators: P9OperatorResult[];
  mismatches: P9Mismatch[];
  ms: number;
}

export interface ReadP9Options {
  /** Extra attempts after an RPC failure (not after a revert). Default 2. */
  retries?: number;
  retryDelayMs?: number;
}

/** Throws INVALID_OPTIONS unless `seed` is a bigint from 0 to MAX_SEED. */
export function checkSeed(seed: bigint): void {
  if (typeof seed !== 'bigint' || seed < 0n || seed > MAX_SEED) {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: 'The P9 seed must be a whole number from 0 to 18446744073709551615 (2^64 - 1).',
    });
  }
}

/** A fresh seed from the platform's CSPRNG: nobody can know in advance which vectors a run checks. */
export function randomSeed(): bigint {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  return BigInt(bytesToHex(b));
}

const WORDS = [{ type: 'uint256' }, { type: 'uint256' }] as const;

/**
 * Vector i of a run: the low 26 bits of keccak256(abi.encode(uint256 seed, uint256 i)), bits 0-2 the state and bits
 * 3-25 the inputs. Anyone can recompute it: `cast keccak $(cast abi-encode "f(uint256,uint256)" <seed> <i>)`.
 */
export function p9Vectors(seed: bigint, count = P9_VECTORS): P9Vector[] {
  checkSeed(seed);
  return Array.from({ length: count }, (_, i) => {
    const w = Number(BigInt(keccak256(encodeAbiParameters(WORDS, [seed, BigInt(i)]))) & 0x3ff_ffffn);
    return { state: w & 7, inputs: w >>> 3 };
  });
}

/** The state and input bytes of step() for a vector: least significant bit first, as in PolicyCodec. */
export function vectorBytes(v: P9Vector): { state: Hex; inputs: Hex } {
  return {
    state: bytesToHex(Uint8Array.of(v.state & 7)),
    inputs: bytesToHex(Uint8Array.of(v.inputs & 0xff, (v.inputs >>> 8) & 0xff, (v.inputs >>> 16) & 0x7f)),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries a read that failed for lack of an answer (a lagging or throttled node), never one the contract answered. */
async function retrying<T>(f: () => Promise<T>, o: ReadP9Options): Promise<T> {
  const retries = o.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      return await f();
    } catch (e) {
      if (attempt >= retries || isContractAnswer(e)) throw e;
      await sleep(o.retryDelayMs ?? 1000);
    }
  }
}

function decodeStep(data: Hex): P9Answer {
  try {
    const [next, out] = decodeFunctionResult({ abi: cpuAbi, functionName: 'step', data });
    return { next: next.toLowerCase() as Hex, out: out.toLowerCase() as Hex };
  } catch {
    return { error: 'undecodable' };
  }
}

/** The answers of one aggregate3 batch, or null when the result does not decode to one entry per call. */
function decodeBatch(data: Hex, n: number): P9Answer[] | null {
  try {
    const r = decodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', data });
    if (r.length !== n) return null;
    return r.map((x) => (x.success ? decodeStep(x.returnData) : { error: 'reverted' as const }));
  } catch {
    return null;
  }
}

async function readOperator(
  c: PublicClient,
  operator: number,
  cpu: Address,
  data: Hex[],
  blockNumber: bigint,
  o: ReadP9Options,
): Promise<P9OperatorRead> {
  let calls = 0;
  /** eth_call at the pinned block: the returned bytes, or the error. */
  const call = async (to: Address, d: Hex): Promise<{ data: Hex } | { error: unknown }> => {
    calls++;
    try {
      return { data: (await retrying(() => c.call({ to, data: d, blockNumber }), o)).data ?? '0x' };
    } catch (error) {
      return { error };
    }
  };
  /** One step() call: a revert is an answer; any other failure is the RPC's and is thrown. */
  const single = async (d: Hex): Promise<P9Answer> => {
    const r = await call(cpu, d);
    if ('data' in r) return decodeStep(r.data);
    if (isContractAnswer(r.error)) return { error: 'reverted' };
    throw decodeError(r.error);
  };
  let code: Hex | undefined;
  try {
    code = await retrying(() => c.getCode({ address: MULTICALL3, blockNumber }), o);
  } catch (e) {
    throw decodeError(e);
  }
  const canonical = codehashOf(code) === MULTICALL3_CODEHASH;
  let multicall = false;
  const answers: P9Answer[] = [];
  for (let i = 0; i < data.length; i += P9_BATCH) {
    const batch = data.slice(i, i + P9_BATCH);
    let got: P9Answer[] | null = null;
    if (canonical) {
      const args = [batch.map((callData) => ({ target: cpu, allowFailure: true, callData }))] as const;
      const r = await call(MULTICALL3, encodeFunctionData({ abi: multicall3Abi, functionName: 'aggregate3', args }));
      got = 'data' in r ? decodeBatch(r.data, batch.length) : null;
      if (got) multicall = true;
    }
    // No Multicall3 with the canonical code, or a batch it did not carry (a revert, an eth_call gas cap, a malformed
    // result): one call per vector. A dead RPC fails these too, and that failure is thrown.
    got ??= await Promise.all(batch.map(single));
    answers.push(...got);
  }
  return { operator, blockNumber, multicall, calls, answers };
}

/**
 * Evaluates every vector with the processor's own step(policyId, state, inputs), by eth_call at `blockNumber`, on each
 * operator separately, so a wrong answer is pinned on the operator that gave it. Reverts are answers; RPC failures throw.
 */
export async function readP9(
  operators: readonly PublicClient[],
  cpu: Address,
  policyId: bigint,
  blockNumber: bigint,
  seed: bigint,
  o: ReadP9Options = {},
): Promise<P9Reads> {
  const t0 = performance.now();
  const vectors = p9Vectors(seed);
  const data = vectors.map((v) => {
    const b = vectorBytes(v);
    return encodeFunctionData({ abi: cpuAbi, functionName: 'step', args: [policyId, b.state, b.inputs] });
  });
  const reads = await Promise.all(operators.map((c, i) => readOperator(c, i + 1, cpu, data, blockNumber, o)));
  return { seed, vectors, operators: reads, ms: Math.round(performance.now() - t0) };
}

/** Compares the processor's answers with the simulator of the compiled on-chain netlist. `program` null: it did not compile. */
export function evaluateP9(program: Program | null, r: P9Reads): P9Result {
  const expected = program
    ? r.vectors.map((v) => {
        const b = vectorBytes(v);
        const s = stepBytes(program, hexToBytes(b.state), hexToBytes(b.inputs));
        return { next: bytesToHex(s.next), out: bytesToHex(s.out) };
      })
    : null;
  const mismatches: P9Mismatch[] = [];
  const operators = r.operators.map((op): P9OperatorResult => {
    let matched = 0;
    if (expected) {
      r.vectors.forEach((v, index) => {
        const want = expected[index];
        const got = op.answers[index];
        if (got && !('error' in got) && got.next === want.next && got.out === want.out) {
          matched++;
          return;
        }
        const answer = got && !('error' in got) ? got : null;
        mismatches.push({
          operator: op.operator,
          index,
          state: v.state,
          inputs: v.inputs,
          expectNext: want.next,
          expectOut: want.out,
          next: answer?.next ?? null,
          out: answer?.out ?? null,
          error: answer ? null : got && 'error' in got ? got.error : 'missing',
        });
      });
    }
    return { operator: op.operator, blockNumber: op.blockNumber, multicall: op.multicall, calls: op.calls, matched };
  });
  return {
    ok:
      expected !== null &&
      r.vectors.length === P9_VECTORS &&
      operators.length > 0 &&
      operators.every((x) => x.matched === r.vectors.length),
    seed: r.seed,
    vectors: r.vectors.length,
    operators,
    mismatches,
    ms: r.ms,
  };
}
