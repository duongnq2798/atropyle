'use client';

import { getDeployment, VERSION } from '@atropyle/sdk';
import type { Address } from 'viem';
import { VerifyReport, VerifyShell, type VerifySite } from '@/app/verify/verify-report';
import { useLocationHash } from '@/lib/hash';
import { useMounted } from '@/lib/use-mounted';
import type { PolicyVerification, ProofProgress, VaultVerification } from '@/verify/types';

/**
 * The /verify/ report in the states the devnet cannot reach (it has no policy circuit and one RPC operator), for the
 * checks and the review screenshots of test/e2e/verify.spec.ts: `#pass` (as on X Layer, with P9 and the code pin),
 * `#running` (the proof half way) and `#fail` (the vault is not a plain proxy). Fixed data, so the shots never change.
 */
const X = getDeployment('xlayer');
/** The same values as test/e2e/verify.spec.ts. */
const VAULT: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const BLOCK = 46_200_000n;
const SITE: VerifySite = {
  version: VERSION,
  explorer: X.explorerUrl,
  cpu: X.cpu,
  quorumGroups: X.quorumRpcUrls.length,
};
const CHECKS = ['factory.isVault', 'vault.proxy', 'vault.factory', 'vault.cpu', 'vault.policyId', 'vaultImpl.codehash'];

const PROOF = {
  ok: true,
  properties: Object.fromEntries(
    ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((p) => [p, { ok: true, violations: 0 }]),
  ),
  combos: 2 ** 26,
  ms: 41_300,
  netlists: [],
  cpu: X.cpu,
  policyId: X.policyId,
  beaconFrozen: true,
  cpuCheck: { ok: true, code: { matches: true } },
  p9: {
    ok: true,
    seed: 20_261_125n,
    vectors: 64,
    operators: [1, 2].map((operator) => ({ operator, blockNumber: BLOCK, multicall: true, calls: 4, matched: 64 })),
    mismatches: [],
    ms: 1_200,
  },
  chainId: X.chainId,
  blockNumber: BLOCK,
  rpcs: 2,
  issues: [],
  firstFailures: [],
  warnings: [],
} as unknown as PolicyVerification;

function verification(o: { notProxy?: boolean; policy?: VaultVerification['policy'] } = {}): VaultVerification {
  return {
    ok: !o.notProxy,
    vault: VAULT,
    chainId: X.chainId,
    blockNumber: BLOCK,
    rpcs: X.quorumRpcUrls.length,
    checks: CHECKS.map((name) =>
      o.notProxy && name === 'vault.proxy'
        ? { name, ok: false, expected: `0x363d3d373d3d3d363d73${'22'.repeat(20)}`, actual: `0x6080${'ab'.repeat(400)}` }
        : { name, ok: true },
    ),
    policy: o.policy ?? { status: 'skipped' },
    warnings: [],
  } as unknown as VaultVerification;
}

interface Scene {
  verification: VaultVerification;
  proofRunning: boolean;
  progress: ProofProgress | null;
}

const SCENES: Record<string, Scene> = {
  pass: {
    verification: verification({ policy: { status: 'verified', result: PROOF, unchanged: true } }),
    proofRunning: false,
    progress: null,
  },
  running: { verification: verification(), proofRunning: true, progress: { done: 2 ** 20, total: 2 ** 21 } },
  fail: { verification: verification({ notProxy: true }), proofRunning: true, progress: null },
};

export default function Page() {
  const hash = useLocationHash();
  const mounted = useMounted();
  if (!mounted) return null;
  const scene = SCENES[hash.slice(1)] ?? SCENES.pass;
  return (
    <VerifyShell vault={VAULT} explorer={SITE.explorer} answered>
      <VerifyReport vault={VAULT} site={SITE} {...scene} proofError={null} />
    </VerifyShell>
  );
}
