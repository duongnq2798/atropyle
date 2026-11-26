'use client';

import type { ReactNode, Ref } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/alerts.messages';
import { messages as ui } from '@/messages/ui.messages';
import { ROUTES } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { Spinner } from '@/ui/spinner';

export type AlertsTone = 'busy' | 'ok' | 'quiet' | 'warn';

const TONE: Record<AlertsTone, string> = {
  busy: 'bg-surface-2 text-thread',
  ok: 'bg-alive/12 text-alive',
  quiet: 'bg-surface-2 text-ink-muted',
  warn: 'bg-grace/12 text-grace',
};

const LINK =
  'underline decoration-line-strong decoration-1 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-thread';

/** The icon of a state; a spinner while the page reads or sends (motion-safe, still under reduced motion). */
export function StateIcon({ tone, children }: { tone: AlertsTone; children?: ReactNode }) {
  return (
    <span aria-hidden="true" className={cn('grid size-12 place-items-center rounded-full', TONE[tone])}>
      {tone === 'busy' ? <Spinner size={22} /> : children}
    </span>
  );
}

/**
 * The one frame of both email pages: the state's icon and title, a status line that exists from the first paint
 * (7A rule 19), the body, and the small print. `note`: the page read a token and cleared it.
 */
export function AlertsFrame({
  state,
  title,
  icon,
  said,
  note,
  titleRef,
  children,
}: {
  state: string;
  title: string;
  icon: ReactNode;
  said: string;
  note: boolean;
  titleRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}) {
  const t = useT(messages);
  const tu = useT(ui);
  return (
    <article
      data-testid="alerts"
      data-state={state}
      aria-labelledby="alerts-title"
      className="mx-auto flex w-full max-w-xl flex-col items-start gap-6 px-4 py-14 sm:px-6 sm:py-20"
    >
      {icon}
      <h1
        id="alerts-title"
        ref={titleRef}
        tabIndex={-1}
        className="text-balance font-display text-h1 text-ink outline-none"
      >
        {title}
      </h1>
      <p role="status" className="sr-only">
        {said}
      </p>
      {children}
      <footer className="flex w-full flex-col gap-2 border-line border-t pt-5 text-caption text-ink-muted">
        {note ? <p data-testid="alerts-token-note">{t('tokenNote')}</p> : null}
        <p>
          {t('privacyLead')}{' '}
          <NavLink href={ROUTES.privacy} prefetch={false} className={LINK}>
            {tu('footerPrivacy')}
          </NavLink>
        </p>
      </footer>
    </article>
  );
}
