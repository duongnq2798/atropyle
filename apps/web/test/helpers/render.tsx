import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ChainProvider } from '@/chain/provider';
import type { Lang } from '@/i18n/core';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import { KEYS, type KV, memoryKV } from '@/lib/store';
import { ThemeProvider } from '@/theme/provider';
import { WalletProvider } from '@/wallet/provider';
import type { WalletWindow } from '@/wallet/types';

export interface ProviderOptions {
  kv?: KV;
  lang?: Lang;
  queryClient?: QueryClient;
  /** Where wallet discovery looks; the test window by default. */
  win?: WalletWindow;
}

/** No retries and no background refetch, so a test sees exactly the requests it makes. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
}

/**
 * The providers of every page (shell/providers.tsx) except MotionProvider, which loads its features
 * asynchronously; `m.*` elements still render their first state without it.
 */
export function TestProviders({
  kv,
  queryClient,
  win,
  children,
}: {
  kv: KV;
  queryClient: QueryClient;
  win?: WalletWindow;
  children: ReactNode;
}) {
  return (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <ChainProvider client={queryClient}>
            <WalletProvider win={win}>{children}</WalletProvider>
          </ChainProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
}

/** For `render` and `renderHook`: `{ wrapper }` plus the storage and the query client the test can inspect. */
export function makeWrapper(o: ProviderOptions = {}) {
  const kv = o.kv ?? memoryKV();
  if (o.lang) kv.set(KEYS.lang, o.lang);
  const queryClient = o.queryClient ?? testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders kv={kv} queryClient={queryClient} win={o.win}>
      {children}
    </TestProviders>
  );
  return { wrapper, kv, queryClient };
}

export function renderWithProviders(ui: ReactElement, o: ProviderOptions = {}) {
  const { wrapper, kv, queryClient } = makeWrapper(o);
  return { ...render(ui, { wrapper }), kv, queryClient };
}
