'use client';

import { useT } from '@/i18n/provider';
import { messages } from '@/messages/glossary.messages';
import { Popover } from '@/ui/popover';

export const GLOSSARY_TERMS = ['vault', 'checkIn', 'alarm', 'guardian', 'xlayer'] as const;
type Term = (typeof GLOSSARY_TERMS)[number];
const DEF = {
  vault: 'vaultDef',
  checkIn: 'checkInDef',
  alarm: 'alarmDef',
  guardian: 'guardianDef',
  xlayer: 'xlayerDef',
} as const satisfies Record<Term, keyof typeof messages.en>;

/**
 * The letter's words, each a button that opens its meaning. The popover renders in a portal on the page, so it takes
 * the page's theme, not the letter's paper (R15).
 */
export function Glossary() {
  const t = useT(messages);
  return (
    <section aria-labelledby="heir-glossary-title" data-testid="heir-glossary" className="flex flex-col gap-3">
      <h3 id="heir-glossary-title" className="text-lead text-ink">
        {t('title')}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {GLOSSARY_TERMS.map((term) => (
          <li key={term}>
            <Popover
              label={t('open', { term: t(term) })}
              align="start"
              trigger={
                <button
                  type="button"
                  data-testid={`heir-term-${term}`}
                  className="min-h-11 rounded-full border border-line px-4 text-small text-ink underline decoration-dotted underline-offset-4 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-thread"
                >
                  {t(term)}
                </button>
              }
            >
              <p data-testid={`heir-term-${term}-def`} className="max-w-[36ch] text-small text-ink">
                {t(DEF[term])}
              </p>
            </Popover>
          </li>
        ))}
      </ul>
    </section>
  );
}
