import type * as Impl from './impl';

export type ChainImpl = typeof Impl;

let pending: Promise<ChainImpl> | null = null;
let loaded: ChainImpl | null = null;

/**
 * The SDK and viem arrive in their own chunk, after the page is interactive (Quyết định 13). One request per page
 * load; a failed request (offline) is forgotten so the next call tries again.
 */
export function loadChainImpl(): Promise<ChainImpl> {
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

/** The impl if it has loaded, else null. Data from any chain query means it has, so pure helpers can run in render. */
export function peekChainImpl(): ChainImpl | null {
  return loaded;
}
