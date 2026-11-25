import { buildAll, deployedNetlists, type Program, stepBytes } from '@atropyle/circuits';
import { CODE_PINS, type P9Reads, type PolicyBundle, p9Vectors, vectorBytes } from '@atropyle/sdk/verify';
import { bytesToHex, hexToBytes } from 'viem';

/** X Layer mainnet as deployments/xlayer.json records it (test/unit/proof-harness.test.ts keeps them equal). */
export const MAINNET = {
  chainId: 196,
  factory: '0x7eCbBECA8F90A868A12aF48B766264bf9c87a651',
  beacon: '0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C',
  policyId: 3n,
  kofn5: 1n,
  ge4: 2n,
  keccak: {
    policy: '0x70167214a030d2024e5b31d7be5f5664e5abad2d7d5323443abed76b776c3864',
    kofn5: '0x43f4044ef39fda26a6769f0c1383e431fcc7f8235c8a2b7cb8c59c081ec8a661',
    ge4: '0x19adccef7c7b0e6661f36ff9dde8a54d662ce21d5b86207b8e8e2a9005f23a32',
  },
} as const;

/** A block after the factory's (76567034). The harness reads nothing, so any later block works. */
export const BLOCK = 76_600_000n;
/** A fixed P9 seed, so the certificate's command is known to the test. */
export const SEED = 20_261_125n;

export interface HarnessOptions {
  /** RPC operators of the bundle and of the P9 reads: 2 by default, as the vercel build asks. */
  rpcs?: number;
  /** No P9 reads: the "not run" row. */
  noP9?: boolean;
  /** Operator 2 answers vector 0 with another state: P9, and so the proof, fails. */
  lie?: boolean;
}

const gates = (c: { nand: number; latch: number }) => c.nand + c.latch;

/** The processor's own step() as the simulator of this repository answers it: what an honest operator returns. */
function p9Reads(program: Program, operators: number, lie: boolean): P9Reads {
  const vectors = p9Vectors(SEED);
  return {
    seed: SEED,
    vectors,
    ms: 0,
    operators: Array.from({ length: operators }, (_, k) => ({
      operator: k + 1,
      blockNumber: BLOCK,
      multicall: true,
      calls: 4,
      answers: vectors.map((v, i) => {
        const b = vectorBytes(v);
        const r = stepBytes(program, hexToBytes(b.state), hexToBytes(b.inputs));
        const next = lie && k === 1 && i === 0 ? Uint8Array.of(r.next[0] ^ 1) : r.next;
        return { next: bytesToHex(next), out: bytesToHex(r.out) };
      }),
    })),
  };
}

/**
 * What readPolicyBundle reads on X Layer mainnet, built from this repository: the netlists taped out on the pinned
 * processor, its frozen beacon and pinned code, and P9 answers from honest operators. The devnet e2e cannot show a
 * passed proof (its processor holds no netlist); this bundle, proved by the production worker, can.
 */
export function harnessBundle(o: HarnessOptions = {}): PolicyBundle {
  const pin = CODE_PINS[MAINNET.chainId];
  if (!pin) throw new Error('the SDK pins no processor code for X Layer');
  const src = buildAll();
  const nl = deployedNetlists(pin.cpu, [MAINNET.kofn5, MAINNET.ge4]);
  const rpcs = o.rpcs ?? 2;
  const code = {
    proxyCodehash: pin.proxyCodehash,
    implementation: pin.implementation,
    implementationCodehash: pin.implementationCodehash,
  };
  return {
    chainId: MAINNET.chainId,
    blockNumber: BLOCK,
    rpcs,
    factory: MAINNET.factory,
    cpu: pin.cpu,
    policyId: MAINNET.policyId,
    expected: {
      cpu: pin.cpu,
      policyId: MAINNET.policyId,
      kofn5: MAINNET.kofn5,
      ge4: MAINNET.ge4,
      keccak: MAINNET.keccak,
    },
    netlists: [
      {
        id: MAINNET.policyId,
        bytes: bytesToHex(nl.policy),
        nIn: 23,
        nOut: 3,
        nState: 3,
        gateCount: src.program.gateCount,
      },
      {
        id: MAINNET.kofn5,
        bytes: bytesToHex(nl.kofn5),
        nIn: src.kofn.nIn,
        nOut: src.kofn.nOut,
        nState: 0,
        gateCount: gates(src.kofn),
      },
      {
        id: MAINNET.ge4,
        bytes: bytesToHex(nl.ge4),
        nIn: src.ge4.nIn,
        nOut: src.ge4.nOut,
        nState: 0,
        gateCount: gates(src.ge4),
      },
    ],
    cpuCheck: {
      ok: true,
      isTapeoutCpu: true,
      nameMatches: true,
      symbolMatches: true,
      beacon: MAINNET.beacon,
      beaconMatches: true,
      beaconFrozen: true,
      transistorsPaired: true,
      code: { ...code, expected: code, matches: true },
    },
    p9: o.noP9 ? null : p9Reads(src.program, rpcs, o.lie === true),
  };
}
