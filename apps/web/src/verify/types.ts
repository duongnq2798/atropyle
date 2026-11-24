export type { PolicyVerification } from '@atropyle/sdk';
export type { PolicyBundle, VaultVerification } from '@atropyle/sdk/verify';

/** Combinations enumerated so far, out of 2^26. */
export interface ProofProgress {
  done: number;
  total: number;
}
