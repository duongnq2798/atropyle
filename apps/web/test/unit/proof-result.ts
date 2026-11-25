import type { P9Result } from '@atropyle/sdk';
import type { PolicyVerification } from '../../src/verify/types';

/** X Layer mainnet as deployments/xlayer.json and the SDK pins record it. */
export const CPU = '0x523db7bacD35a6EFc384367D66AEC1CBA07a4A05' as const;
export const KECCAK = {
  policy: '0x70167214a030d2024e5b31d7be5f5664e5abad2d7d5323443abed76b776c3864',
  kofn5: '0x43f4044ef39fda26a6769f0c1383e431fcc7f8235c8a2b7cb8c59c081ec8a661',
  ge4: '0x19adccef7c7b0e6661f36ff9dde8a54d662ce21d5b86207b8e8e2a9005f23a32',
} as const;
export const SEED = 20_261_125n;
export const BLOCK = 76_600_000n;

const PIN = {
  proxyCodehash: '0x8c799a18cd8e0d5f5f3c0cec4fbc145e2daf79f70c2b131c09d0f380921db545',
  implementation: '0x977f217887E085D298Cb3819cDAD5A0ee35F29B2',
  implementationCodehash: '0x7a15c353205e5245f40f5f5524542a982a4bb3b9a28476e4f10845163f941b30',
} as const;

export const P9_OK: P9Result = {
  ok: true,
  seed: SEED,
  vectors: 64,
  operators: [
    { operator: 1, blockNumber: BLOCK, multicall: true, calls: 4, matched: 64 },
    { operator: 2, blockNumber: BLOCK, multicall: false, calls: 64, matched: 64 },
  ],
  mismatches: [],
  ms: 812,
};

const HOLDS = { ok: true, violations: 0 };

/** A passed full proof on X Layer, as the worker returns it; `over` replaces whole fields. */
export function okResult(over: Partial<PolicyVerification> = {}): PolicyVerification {
  return {
    ok: true,
    properties: { P1: HOLDS, P2: HOLDS, P3: HOLDS, P4: HOLDS, P5: HOLDS, P6: HOLDS, P7: HOLDS, P8: HOLDS },
    combos: 67_108_864,
    ms: 18_193,
    netlists: [
      { id: 3n, role: 'policy', keccak: KECCAK.policy, gates: 199, matchesSource: true, matchesDeployment: true },
      { id: 1n, role: 'kofn5', keccak: KECCAK.kofn5, gates: 41, matchesSource: true, matchesDeployment: true },
      { id: 2n, role: 'ge4', keccak: KECCAK.ge4, gates: 25, matchesSource: true, matchesDeployment: true },
    ],
    cpu: CPU,
    policyId: 3n,
    beaconFrozen: true,
    cpuCheck: {
      ok: true,
      isTapeoutCpu: true,
      nameMatches: true,
      symbolMatches: true,
      beacon: '0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C',
      beaconMatches: true,
      beaconFrozen: true,
      transistorsPaired: true,
      code: { ...PIN, expected: PIN, matches: true },
    },
    p9: P9_OK,
    chainId: 196,
    blockNumber: BLOCK,
    rpcs: 2,
    issues: [],
    firstFailures: [],
    warnings: [],
    ...over,
  };
}
