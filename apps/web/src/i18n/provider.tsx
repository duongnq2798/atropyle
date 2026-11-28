'use client';

import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';
import { useKV } from '@/lib/kv';
import { KEYS } from '@/lib/store';
import { detectLang, type Lang, type Messages, type Params, translate } from './core';

export interface LangValue {
  lang: Lang;
  setLang(l: Lang): void;
}

const LangContext = createContext<LangValue | null>(null);

/**
 * Quyết định 15: the static HTML is English. After mount the stored choice, or else the browser language, wins.
 */
export function LangProvider({ children }: { children: ReactNode }) {
  const kv = useKV();
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    setLangState(detectLang(kv.get(KEYS.lang), navigator.languages ?? []));
  }, [kv]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      kv.set(KEYS.lang, l);
      setLangState(l);
    },
    [kv],
  );

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext value={value}>{children}</LangContext>;
}

/** Hands a LangProvider's value to a tree in a React root of its own (the home stage, home/stage-island.tsx). */
export function LangBridge({ value, children }: { value: LangValue; children: ReactNode }) {
  return <LangContext value={value}>{children}</LangContext>;
}

export function useLang(): LangValue {
  const v = use(LangContext);
  if (!v) throw new Error('useLang must be used inside <LangProvider>');
  return v;
}

export function useT<K extends string>(m: Messages<K>): (key: K, params?: Params) => string {
  const { lang } = useLang();
  return useCallback((key: K, params?: Params) => translate(m, lang, key, params), [m, lang]);
}
