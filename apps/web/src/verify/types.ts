export type { PolicyVerification } from '@atropyle/sdk';
export type { PolicyBundle, VaultVerification } from '@atropyle/sdk/verify';

/** Blocks of 32 combinations enumerated so far, out of 2^21 for the full proof (total = blocks). */
export interface ProofProgress {
  done: number;
  total: number;
}
