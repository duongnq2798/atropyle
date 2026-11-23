import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Lang } from '@/i18n/core';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import { KEYS, type KV, memoryKV } from '@/lib/store';

/** Renders inside the storage and language providers, as every page is; `rerender` keeps them. */
export function renderWithProviders(ui: ReactElement, o: { kv?: KV; lang?: Lang } = {}) {
  const kv = o.kv ?? memoryKV();
  if (o.lang) kv.set(KEYS.lang, o.lang);
  const wrap = (node: ReactElement) => (
    <KVProvider kv={kv}>
      <LangProvider>{node}</LangProvider>
    </KVProvider>
  );
  const r = render(wrap(ui));
  return { ...r, kv, rerender: (next: ReactElement) => r.rerender(wrap(next)) };
}
