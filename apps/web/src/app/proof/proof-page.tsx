'use client';

import { ProofView } from '@/proof/proof-view';
import { useProofRun } from '@/proof/use-proof-run';

/** The page's client half: the proof run of this session, or a fresh one (useProofRun). */
export function ProofPage() {
  const run = useProofRun();
  return <ProofView run={run} />;
}
