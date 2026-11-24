'use client';

import { useEffect, useMemo, useState } from 'react';
import { ENV } from '@/config/env';
import type { ErrorDescription } from './impl/describe';
import { loadTxImpl, peekTxImpl, type TxImpl } from './load';

export type { ErrorDescription } from './impl/describe';

export interface ErrorViewState {
  /** null when there is no error, while the decoder loads, or when it cannot load. */
  view: ErrorDescription | null;
  /** The decoder could not load (offline): show a plain sentence instead. */
  unavailable: boolean;
}

/**
 * Describes any thrown value the way the SDK does: message, hint, and a docs link built from the code. The decoder
 * lives next to the SDK; a page that shows an error has almost always loaded it, so this is synchronous in practice.
 */
export function useErrorView(error: unknown): ErrorViewState {
  const [fetched, setFetched] = useState<TxImpl | null>(null);
  const [failed, setFailed] = useState<{ error: unknown } | null>(null);
  const impl = fetched ?? peekTxImpl();

  useEffect(() => {
    if (error === null || error === undefined || impl) return;
    let live = true;
    loadTxImpl().then(
      (m) => {
        if (live) setFetched(m);
      },
      () => {
        if (live) setFailed({ error });
      },
    );
    return () => {
      live = false;
    };
  }, [error, impl]);

  const view = useMemo(
    () => (impl && error !== null && error !== undefined ? impl.describeError(error, ENV.docsPath) : null),
    [impl, error],
  );
  return { view, unavailable: !impl && failed !== null && failed.error === error };
}
