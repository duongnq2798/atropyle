'use client';

import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import { useId } from 'react';
import { useT } from '@/i18n/provider';
import { messages as ui } from '@/messages/ui.messages';
import { withViewTransition } from '@/motion/view-transition';
import { useTheme } from '@/theme/provider';
import { THEME_CHOICES, type ThemeChoice } from '@/theme/theme';

const OPTION: Record<ThemeChoice, { label: 'themeDark' | 'themeLight' | 'themeSystem'; Icon: LucideIcon }> = {
  dark: { label: 'themeDark', Icon: Moon },
  light: { label: 'themeLight', Icon: Sun },
  system: { label: 'themeSystem', Icon: Monitor },
};

/**
 * Night, Vellum, Match device (R18.1), in the order of THEME_CHOICES. Icon above the word, so "Match device" fits
 * the 18rem popover in both languages. The new theme crossfades in through a View Transition where the browser has
 * one (reduced motion: instant).
 */
export function ThemeSwitch() {
  const { choice, setChoice } = useTheme();
  const t = useT(ui);
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-caption text-ink-muted">{t('theme')}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-2 p-1">
        {THEME_CHOICES.map((value) => {
          const { label, Icon } = OPTION[value];
          return (
            <label
              key={value}
              className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center text-caption text-ink-muted leading-tight transition-colors duration-150 hover:text-ink has-checked:bg-surface-1 has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-thread has-focus-visible:outline-offset-2"
            >
              <input
                type="radio"
                name={name}
                value={value}
                checked={choice === value}
                onChange={() => withViewTransition(() => setChoice(value))}
                className="sr-only"
              />
              <Icon aria-hidden="true" size={16} strokeWidth={1.5} />
              {t(label)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
