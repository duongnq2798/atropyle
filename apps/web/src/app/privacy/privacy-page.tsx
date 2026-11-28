'use client';

import { Stamp } from '@/home/scene';
import { useT } from '@/i18n/provider';
import { REPO_URL } from '@/lib/links';
import { messages as privacy } from '@/messages/privacy.messages';
import { ExternalLink } from '@/ui/external-link';

type Key = keyof typeof privacy.en;

const SECTIONS: readonly { id: string; title: Key; items: readonly Key[] }[] = [
  { id: 'site', title: 'siteTitle', items: ['site1', 'site2', 'site3'] },
  { id: 'wallet', title: 'walletTitle', items: ['wallet1', 'wallet2'] },
  { id: 'email', title: 'emailTitle', items: ['email1', 'email2', 'email3', 'email4', 'email5', 'email6'] },
  { id: 'me', title: 'meTitle', items: ['me1'] },
  { id: 'onchain', title: 'onchainTitle', items: ['onchain1'] },
  { id: 'contact', title: 'contactTitle', items: ['contact1'] },
];

export function PrivacyPage() {
  const t = useT(privacy);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4 py-12 sm:px-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <Stamp glyph="mark">{t('stamp')}</Stamp>
        <h1 className="voice-proclaim text-h1">{t('title')}</h1>
        <p className="text-pretty text-ink-muted text-lead">{t('lead')}</p>
      </header>
      {/* A ledger of promises: each heading in its own column on wide screens, the claims beside it. */}
      <div className="flex flex-col border-line border-t">
        {SECTIONS.map((s) => (
          <section
            key={s.id}
            aria-labelledby={`privacy-${s.id}`}
            className="grid gap-3 border-line border-b py-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10"
          >
            <h2 id={`privacy-${s.id}`} className="voice-proclaim text-balance text-title">
              {t(s.title)}
            </h2>
            <ul className="flex flex-col gap-3 text-pretty">
              {s.items.map((k) => (
                <li key={k} className="relative pl-5">
                  <span aria-hidden="true" className="absolute top-[0.7em] left-0 h-px w-2.5 bg-thread" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <ExternalLink href={`${REPO_URL}/issues`}>{t('contactLink')}</ExternalLink>
    </div>
  );
}
