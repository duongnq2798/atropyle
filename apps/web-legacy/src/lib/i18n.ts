export type Lang = 'en' | 'vi';

export interface Messages<K extends string> {
  readonly en: Readonly<Record<K, string>>;
  readonly vi: Readonly<Record<K, string>>;
}

export type Params = Record<string, string | number | bigint>;

/** `vi` must have exactly the keys of `en` (checked by the compiler and by test/unit/i18n.test.ts). */
export function defineMessages<K extends string>(en: Record<K, string>, vi: Record<NoInfer<K>, string>): Messages<K> {
  return { en, vi };
}

export function format(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

export function translate<K extends string>(m: Messages<K>, lang: Lang, key: K, params?: Params): string {
  return format(m[lang][key] ?? m.en[key], params);
}

export function placeholders(s: string): string[] {
  return [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]))].sort();
}

export function detectLang(stored: string | null, languages: readonly string[]): Lang {
  if (stored === 'en' || stored === 'vi') return stored;
  return (languages[0] ?? '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
