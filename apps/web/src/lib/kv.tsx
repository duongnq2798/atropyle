'use client';

import { createContext, type ReactNode, use, useState } from 'react';
import { type KV, safeKV } from './store';

const KVContext = createContext<KV | null>(null);

/** localStorage behind safeKV; while prerendering there is no window, so it is memory only. */
export function KVProvider({ kv, children }: { kv?: KV; children: ReactNode }) {
  const [value] = useState<KV>(() => kv ?? safeKV(() => window.localStorage));
  return <KVContext value={value}>{children}</KVContext>;
}

export function useKV(): KV {
  const kv = use(KVContext);
  if (!kv) throw new Error('useKV must be used inside <KVProvider>');
  return kv;
}
