import type { ReactNode } from 'react';
import { type Lang, type Messages, type Params, translate } from './core';

/** English first: the static HTML reads English until LangProvider sets <html lang> (Quyết định 15). */
const LANGS: readonly Lang[] = ['en', 'vi'];

/**
 * Text of a server component in both languages, each in a span with its own `lang`; globals.css shows the one that
 * <html lang> names and keeps the other at display: none, so neither a screen reader nor find-in-page meets it. No
 * hook and no script: the words are in the HTML only (test/build/home.test.ts), which is how the home page's bands
 * stay out of a first load with no JavaScript to spare (7C-T7a).
 */
export function ByLang({ text }: { text: (lang: Lang) => string }): ReactNode {
  // The same words in both languages (a name, "Agent") need no span: they read the same under either <html lang>.
  const en = text('en');
  if (en === text('vi')) return en;
  return LANGS.map((lang) => (
    <span key={lang} lang={lang} className={`say-${lang}`}>
      {text(lang)}
    </span>
  ));
}

/** A message of `m` in both languages; `params` gives each language its own values (numbers, durations). */
export function Say<K extends string>({
  m,
  k,
  params,
}: {
  m: Messages<K>;
  k: K;
  params?: (lang: Lang) => Params;
}): ReactNode {
  return <ByLang text={(lang) => translate(m, lang, k, params?.(lang))} />;
}
