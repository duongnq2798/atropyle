'use client';

import { type ReactNode, useId } from 'react';
import { XLAYER_EXPLORER } from '@/config/env';
import { MAINNET_FACTORY, MAINNET_SINCE } from '@/config/facts';
import { useLang, useT } from '@/i18n/provider';
import { formatDay } from '@/lib/format';
import { explorerAddress } from '@/lib/links';
import { messages as home } from '@/messages/home.messages';
import { createHref, ROUTES } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { buttonClass } from '@/ui/button';
import { ExternalLink } from '@/ui/external-link';

/** The factory on X Layer mainnet: a fact about mainnet, whatever chain this build reads. */
const FACTORY_URL = explorerAddress(XLAYER_EXPLORER, MAINNET_FACTORY);

/** Inline link look of the footer and ExternalLink, in the body ink: the door for heirs must be found. */
const DOOR =
  'text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors duration-150 ' +
  'hover:decoration-thread';

/**
 * Scene 1 of the home page (spec §5.1, §18.4.3 Task 4): the question, the weave of the real circuit, the two ways in
 * and three facts. `art` is the weave, rendered on the server by app/page.tsx, so its numbers are in the HTML and in
 * no script. On a phone it is a strip under the question; from 64rem globals.css lays it behind the whole section,
 * faded under this text column (the left 7/12). The Drill offer carries its cost in a note right under it, linked
 * with aria-describedby (R18.11). The facts are static: nothing here fetches.
 */
export function HomeHero({ art }: { art: ReactNode }) {
  const t = useT(home);
  const { lang } = useLang();
  const noteId = useId();
  return (
    <section className="relative isolate overflow-hidden">
      <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-16 sm:px-6 lg:pt-28 lg:pb-28">
        <div className="flex flex-col gap-6 lg:w-7/12">
          <h1 className="text-balance font-display text-display lg:text-h1">{t('heroTitle')}</h1>
          {art}
          <p className="max-w-2xl text-pretty text-ink-muted text-lead">{t('heroLead')}</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <NavLink
                href={createHref('drill')}
                prefetch={false}
                aria-describedby={noteId}
                className={buttonClass({ variant: 'primary', size: 'lg' })}
              >
                {t('heroDrill')}
              </NavLink>
              <NavLink href={ROUTES.proof} className={buttonClass({ variant: 'secondary', size: 'lg' })}>
                {t('heroProof')}
              </NavLink>
            </div>
            <p id={noteId} className="text-balance text-ink-muted text-small">
              {t('heroDrillNote')}
            </p>
          </div>
          <ul
            data-testid="hero-facts"
            className="flex flex-col gap-2 text-balance border-line border-t pt-5 text-ink-muted text-small lg:flex-row lg:flex-wrap lg:gap-x-6"
          >
            <li>{t('heroFactCustody')}</li>
            <li>
              <ExternalLink href={FACTORY_URL}>
                {t('heroFactLive', { date: formatDay(MAINNET_SINCE, lang) })}
              </ExternalLink>
            </li>
            <li>
              <NavLink href={ROUTES.verify} prefetch={false} className={DOOR}>
                {t('heroHeirDoor')}
              </NavLink>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
