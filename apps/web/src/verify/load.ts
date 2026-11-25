import type * as Impl from './impl';

export type VerifyImpl = typeof Impl;

let pending: Promise<VerifyImpl> | null = null;

/** The proof code (quorum reads, the worker client) loads when a page first asks for a proof. */
export function loadVerifyImpl(): Promise<VerifyImpl> {
  pending ??= import('./impl').catch((e: unknown) => {
    pending = null;
    throw e;
  });
  return pending;
}
