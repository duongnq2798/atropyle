import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** False while prerendering and hydrating, true afterwards: for markup that must match the static HTML first. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
