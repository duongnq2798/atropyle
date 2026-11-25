import type * as Impl from './impl';

export type TxImpl = typeof Impl;

let pending: Promise<TxImpl> | null = null;
let loaded: TxImpl | null = null;

/**
 * The error decoder of the SDK, in a chunk of its own (Quyết định 13). A card that can send loads it on mount, so a
 * failure is described at once; a failed request (offline) is forgotten so the next call tries again.
 */
export function loadTxImpl(): Promise<TxImpl> {
  pending ??= import('./impl').then(
    (impl) => {
      loaded = impl;
      return impl;
    },
    (e: unknown) => {
      pending = null;
      throw e;
    },
  );
  return pending;
}

/** The decoder if it has loaded, else null: lets ErrorBox describe an error in the same render. */
export function peekTxImpl(): TxImpl | null {
  return loaded;
}
