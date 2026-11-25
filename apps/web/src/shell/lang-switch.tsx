'use client';

import { useId } from 'react';
import type { Lang } from '@/i18n/core';
import { useLang, useT } from '@/i18n/provider';
import { messages as ui } from '@/messages/ui.messages';

const OPTIONS: readonly { value: Lang; label: 'langEn' | 'langVi' }[] = [
  { value: 'en', label: 'langEn' },
  { value: 'vi', label: 'langVi' },
];

/** Native radios in a fieldset (spec §6): arrow keys move between them and screen readers announce a group. */
export function LangSwitch() {
  const { lang, setLang } = useLang();
  const t = useT(ui);
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-caption text-ink-muted">{t('language')}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface-2 p-1">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            lang={o.value}
            className="cursor-pointer rounded-full px-3 py-1.5 text-center text-ink-muted text-small transition-colors duration-150 hover:text-ink has-checked:bg-surface-1 has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-thread has-focus-visible:outline-offset-2"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={lang === o.value}
              onChange={() => setLang(o.value)}
              className="sr-only"
            />
            {t(o.label)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
