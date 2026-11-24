'use client';

import Link from 'next/link';
import { useId } from 'react';
import { useT } from '@/i18n/provider';
import { messages as home } from '@/messages/home.messages';
import { createHref, ROUTES } from '@/routes';
import { Thread } from '@/thread/thread';
import { buttonClass } from '@/ui/button';

/**
 * The first scene of the home page (spec §5.1). Plan 7B adds the other five. The Drill offer carries its cost in a
 * note right under it, linked with aria-describedby, so no reader hears "6 minutes" without "network gas" (R18.11).
 */
export function HomeHero() {
  const t = useT(home);
  const noteId = useId();
  return (
    <section className="relative isolate flex flex-col gap-12 overflow-hidden pt-16 pb-20 md:pt-28">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 sm:px-6">
        <p className="font-medium text-caption text-thread uppercase tracking-[0.16em]">{t('heroEyebrow')}</p>
        <h1 className="max-w-4xl text-balance font-display text-display">{t('heroTitle')}</h1>
        <p className="max-w-2xl text-pretty text-ink-muted text-lead">{t('heroLead')}</p>
        <div className="flex flex-col gap-3 pt-2">
          <div className="flex flex-wrap gap-3">
            <Link
              href={createHref('drill')}
              prefetch={false}
              aria-describedby={noteId}
              className={buttonClass({ variant: 'primary', size: 'lg' })}
            >
              {t('heroDrill')}
            </Link>
            <Link href={ROUTES.proof} prefetch={false} className={buttonClass({ variant: 'secondary', size: 'lg' })}>
              {t('heroProof')}
            </Link>
          </div>
          <p id={noteId} className="text-ink-muted text-small">
            {t('heroDrillNote')}
          </p>
        </div>
      </div>
      <Thread state="active" remaining={0.72} knots={[0.16, 0.34, 0.52]} shared className="w-full" />
    </section>
  );
}
