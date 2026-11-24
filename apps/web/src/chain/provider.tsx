'use client';

import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';
import { useKV } from '@/lib/kv';
import { KEYS } from '@/lib/store';
import { makeQueryClient } from './query-client';

interface ChainSettings {
  /** Verify reads from a second RPC operator too (off-chain on DeWEB, so off unless the user turns it on). */
  crossCheck: boolean;
  setCrossCheck(on: boolean): void;
}

const SettingsContext = createContext<ChainSettings | null>(null);

export function ChainProvider({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? makeQueryClient());
  const kv = useKV();
  const [crossCheck, setCross] = useState(false);

  useEffect(() => {
    setCross(kv.get(KEYS.crossCheck) === '1');
  }, [kv]);

  const setCrossCheck = useCallback(
    (on: boolean) => {
      kv.set(KEYS.crossCheck, on ? '1' : '0');
      setCross(on);
    },
    [kv],
  );

  const settings = useMemo(() => ({ crossCheck, setCrossCheck }), [crossCheck, setCrossCheck]);
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsContext value={settings}>{children}</SettingsContext>
    </QueryClientProvider>
  );
}

export function useChainSettings(): ChainSettings {
  const v = use(SettingsContext);
  if (!v) throw new Error('useChainSettings must be used inside <ChainProvider>');
  return v;
}
