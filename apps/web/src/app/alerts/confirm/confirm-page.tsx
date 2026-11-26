'use client';

import { ArrowRight, CloudOff, Globe, Hourglass, MailCheck, Unlink } from 'lucide-react';
import type { ReactNode } from 'react';
import { apiErrorCode } from '@/api/errors';
import type { ConfirmResponse } from '@/api/types';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/alerts.messages';
import { messages as labels, ROLE_KEY } from '@/messages/labels.messages';
import { messages as subscribe } from '@/messages/subscribe.messages';
import { ROUTES, vaultHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { buttonClass } from '@/ui/button';
import { AlertsFrame, StateIcon } from '../alerts-view';
import { type ConfirmState, useConfirmFlow } from '../token';

/** What each role is sent: the sign-up form's own lines (subscribe.messages), so the two never disagree. */
const ROLE_LINE = { owner: 'roleOwner', guardian: 'roleGuardian', heir: 'roleHeir' } as const;
const ICON = { size: 22, strokeWidth: 1.5, 'aria-hidden': true } as const;

export interface ConfirmViewProps {
  state: ConfirmState;
  result: ConfirmResponse | null;
  error: unknown;
  onRetry(): void;
}

/** Every state of /alerts/confirm/, driven by its props: the page gives useConfirmFlow, the e2e preview stand-ins. */
export function ConfirmView({ state, result, error, onRetry }: ConfirmViewProps) {
  const t = useT(messages);
  const s = useT(subscribe);
  const l = useT(labels);
  const expired = state === 'error' && apiErrorCode(error) === 'TOKEN_INVALID';
  const note = state !== 'reading' && state !== 'invalid';

  let title: string;
  let said: string;
  let icon: ReactNode;
  let body: ReactNode = null;
  if (state === 'reading' || state === 'working') {
    title = t('confirmTitle');
    said = state === 'reading' ? t('saidReading') : t('saidConfirming');
    icon = <StateIcon tone="busy" />;
  } else if (state === 'invalid') {
    title = t('invalidTitle');
    said = title;
    icon = (
      <StateIcon tone="warn">
        <Unlink {...ICON} />
      </StateIcon>
    );
    body = <p className="text-pretty text-ink-muted text-lead">{t('invalidBody')}</p>;
  } else if (state === 'hostedOnly') {
    title = t('hostedOnlyTitle');
    said = title;
    icon = (
      <StateIcon tone="quiet">
        <Globe {...ICON} />
      </StateIcon>
    );
    body = <p className="text-pretty text-ink-muted text-lead">{t('hostedOnlyBody')}</p>;
  } else if (expired) {
    title = t('expiredTitle');
    said = title;
    icon = (
      <StateIcon tone="warn">
        <Hourglass {...ICON} />
      </StateIcon>
    );
    body = (
      <>
        <p className="text-pretty text-ink-muted text-lead">{t('expiredBody')}</p>
        <NavLink href={ROUTES.me} className={buttonClass({ variant: 'secondary' })}>
          {t('findVaults')}
        </NavLink>
      </>
    );
  } else if (state === 'error') {
    title = t('confirmError');
    // The error box is an alert of its own.
    said = '';
    icon = (
      <StateIcon tone="warn">
        <CloudOff {...ICON} />
      </StateIcon>
    );
    body = <ErrorBox error={error} onRetry={onRetry} className="w-full" />;
  } else {
    title = t('confirmedTitle');
    said = title;
    icon = (
      <StateIcon tone="ok">
        <MailCheck {...ICON} />
      </StateIcon>
    );
    body = result ? (
      <div className="flex w-full flex-col gap-5">
        <p className="text-pretty text-ink-muted text-lead">{s(ROLE_LINE[result.role])}</p>
        <dl className="grid min-w-0 grid-cols-1 gap-y-0.5 rounded-2xl border border-line bg-surface-1 p-4 text-small sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-4 sm:gap-y-3">
          <dt className="text-caption text-ink-muted sm:text-small">{t('vaultLabel')}</dt>
          <dd className="min-w-0">
            {/* Parsed by the client (confirmOf: an address and a role, nothing else), checksummed by the backend. */}
            <Address address={result.vault} size="sm" />
          </dd>
          <dt className="mt-3 text-caption text-ink-muted sm:mt-0 sm:text-small">{t('roleLabel')}</dt>
          <dd className="text-ink">{l(ROLE_KEY[result.role])}</dd>
        </dl>
        <p className="text-ink-muted text-small">{t('confirmedStop')}</p>
        <NavLink
          href={vaultHref(result.vault)}
          prefetch={false}
          className={buttonClass({ variant: 'primary', className: 'gap-1.5 self-start' })}
        >
          {t('openVault')}
          <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} />
        </NavLink>
      </div>
    ) : null;
  }

  return (
    <AlertsFrame state={state} title={title} icon={icon} said={said} note={note}>
      {body}
    </AlertsFrame>
  );
}

export function ConfirmPage() {
  const f = useConfirmFlow();
  return <ConfirmView state={f.state} result={f.result} error={f.error} onRetry={f.retry} />;
}
