'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import { BellRing, Mail, MailCheck, RotateCcw } from 'lucide-react';
import { type FormEvent, type JSX, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { apiErrorCode } from '@/api/errors';
import { useSubscribe } from '@/api/hooks';
import type { OkResponse, SubscribeRequest } from '@/api/types';
import { useSdk } from '@/chain/hooks';
import { IS_VERCEL } from '@/config/env';
import type { Lang } from '@/i18n/core';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/subscribe.messages';
import { messages as ui } from '@/messages/ui.messages';
import { ROUTES } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { Button } from '@/ui/button';
import { ExternalLink } from '@/ui/external-link';
import { InlineError } from '@/ui/inline-error';
import { TextField } from '@/ui/text-field';
import { isEmail } from './email';
import { hostedHref } from './hosted';

export interface SubscribeFormProps {
  vault: `0x${string}`; // checksummed
  role: 'owner' | 'guardian' | 'heir';
  /** Tighter layout for the wizard's Done step and /join/. */
  compact?: boolean;
}

export type SubscribeFailKey =
  | 'errorRateLimited'
  | 'errorInvalid'
  | 'errorNotVault'
  | 'errorTimeout'
  | 'errorUnavailable';

/**
 * The words for a failed sign-up, chosen by the error's code alone (read structurally, src/api/errors.ts). None says
 * whether the address had signed up before: the backend answers 202 either way (spec §9.6). A timeout has words of
 * its own, because the request may have arrived and the email may be on its way.
 */
export function subscribeFailKey(e: unknown): SubscribeFailKey {
  switch (apiErrorCode(e)) {
    case 'RATE_LIMITED':
      return 'errorRateLimited';
    case 'INVALID_INPUT':
      return 'errorInvalid';
    case 'NOT_A_VAULT':
      return 'errorNotVault';
    case 'TIMEOUT':
      return 'errorTimeout';
    default:
      return 'errorUnavailable';
  }
}

type Mode = 'form' | 'done' | 'hosted-only';

/** What each role is sent, as the backend's notices are (apps/backend/src/tick/notices.ts and the reminders). */
const ROLE_LINE = { owner: 'roleOwner', guardian: 'roleGuardian', heir: 'roleHeir' } as const;

const LANGS: readonly { value: Lang; label: 'langEn' | 'langVi' }[] = [
  { value: 'en', label: 'langEn' },
  { value: 'vi', label: 'langVi' },
];

const BOX = 'flex flex-col gap-4 rounded-3xl border border-line bg-surface-1';

/** The segmented radios of LangSwitch, at the input's height so the two line up. */
const RADIO =
  'flex cursor-pointer items-center justify-center rounded-full px-4 text-ink-muted text-small ' +
  'transition-colors duration-150 hover:text-ink has-checked:bg-surface-1 has-checked:text-ink has-checked:shadow-sm ' +
  'has-focus-visible:outline-2 has-focus-visible:outline-thread has-focus-visible:outline-offset-2';

const LINK =
  'underline decoration-line-strong decoration-1 underline-offset-4 transition-colors duration-150 ' +
  'hover:text-ink hover:decoration-thread';

/**
 * Email alerts for one vault and one role. The hosted build signs up through the backend; the DeWEB build has no
 * backend (spec §5.7) and points to the sign-up on the main site instead.
 */
export function SubscribeForm(props: SubscribeFormProps): JSX.Element {
  return IS_VERCEL ? <HostedForm key={`${props.vault}.${props.role}`} {...props} /> : <DewebNote {...props} />;
}

/** A new vault or role is a new form (the key above), never the answer given for the last one. */
function HostedForm(props: SubscribeFormProps) {
  const sub = useSubscribe();
  return <HostedFormView {...props} sub={sub} />;
}

function DewebNote({ vault, role, compact }: SubscribeFormProps) {
  const webUrl = useSdk().data?.deployment.webUrl ?? null;
  return <HostedOnlyNote vault={vault} role={role} compact={compact} webUrl={webUrl} />;
}

/** The one frame of every state: the section, its title and the mode the tests read. */
function Shell({ mode, compact, children }: { mode: Mode; compact: boolean; children: ReactNode }) {
  const t = useT(messages);
  const titleId = useId();
  return (
    <section
      data-testid="subscribe"
      data-mode={mode}
      aria-labelledby={titleId}
      className={cn(BOX, compact ? 'p-4' : 'p-5 sm:p-6')}
    >
      <div className="flex items-center gap-2">
        <BellRing aria-hidden="true" size={18} strokeWidth={1.5} className="shrink-0 text-thread" />
        <h3 id={titleId} className="font-medium text-body text-ink">
          {t('title')}
        </h3>
      </div>
      {children}
    </section>
  );
}

/** The DeWEB build: why there is no form here, and where this vault's sign-up is. It asks nothing. */
export function HostedOnlyNote({
  vault,
  role,
  compact = false,
  webUrl,
}: SubscribeFormProps & { webUrl: string | null }): JSX.Element {
  const t = useT(messages);
  const link = webUrl === null ? null : hostedHref(webUrl, vault, role);
  return (
    <Shell mode="hosted-only" compact={compact}>
      <p className="text-ink-muted text-small">{t(ROLE_LINE[role])}</p>
      <div className="flex flex-col gap-1 border-line border-l-2 pl-3">
        <p className="text-ink text-small">{t('hostedOnly')}</p>
        <p className="text-caption text-ink-muted">{t('hostedOnlyWhy')}</p>
      </div>
      {link ? (
        <ExternalLink href={link.href} className="self-start font-medium text-ink text-small">
          {t('hostedLink', { host: link.host })}
        </ExternalLink>
      ) : null}
    </Shell>
  );
}

export interface HostedFormViewProps extends SubscribeFormProps {
  /** useSubscribe() on a page; a stand-in mutation on the e2e preview (src/app/e2e/subscribe/page.e2e.tsx). */
  sub: UseMutationResult<OkResponse, Error, SubscribeRequest>;
}

/** The hosted form, driven by the mutation it is given. */
export function HostedFormView({ vault, role, compact = false, sub }: HostedFormViewProps): JSX.Element {
  const t = useT(messages);
  const tu = useT(ui);
  const { lang } = useLang();
  const radioName = useId();
  const errorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const trapRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const wasDone = useRef(false);
  const [email, setEmail] = useState('');
  // null follows the page's language, which LangProvider sets only after mount (the static HTML is English).
  const [chosen, setChosen] = useState<Lang | null>(null);
  const [invalid, setInvalid] = useState(false);
  // `n` keys the spoken node, so the same words said twice are heard twice.
  const [said, setSaid] = useState({ n: 0, text: '' });
  const mailLang = chosen ?? lang;
  const done = sub.isSuccess;

  // The form leaves the page on success and comes back on "Use another email address"; the focus goes with it.
  useEffect(() => {
    if (done) doneRef.current?.focus();
    else if (wasDone.current) emailRef.current?.focus();
    wasDone.current = done;
  }, [done]);

  const announce = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const edit = (next: string) => {
    setEmail(next);
    if (invalid && isEmail(next.trim())) setInvalid(false);
    if (sub.isError) sub.reset();
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sub.isPending) return;
    const value = email.trim();
    if (!isEmail(value)) {
      const field = emailRef.current;
      const stays = field !== null && field === document.activeElement;
      // Committed before the focus moves, so the field is read with its error.
      flushSync(() => setInvalid(true));
      field?.focus();
      // A focus that moves reads the error (aria-describedby); one that stays (Enter in the field) hears it here.
      if (stays) announce(t('emailInvalid'));
      return;
    }
    setInvalid(false);
    sub.mutate(
      { email: value, vault, role, lang: mailLang, website: trapRef.current?.value ?? '' },
      {
        onSuccess: (_ok, req) => announce(t('checkInboxHelp', { email: req.email })),
        onError: (err) => announce(t(subscribeFailKey(err))),
      },
    );
  };

  return (
    <Shell mode={done ? 'done' : 'form'} compact={compact}>
      {done ? (
        <div className="flex flex-col items-start gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-thread/12 text-thread">
            <MailCheck aria-hidden="true" size={20} strokeWidth={1.5} />
          </span>
          <div className="flex flex-col gap-1.5">
            <p ref={doneRef} tabIndex={-1} className="font-display text-ink text-title outline-none">
              {t('checkInbox')}
            </p>
            <p className="max-w-[60ch] text-ink-muted text-small wrap-anywhere">
              {t('checkInboxHelp', { email: sub.variables?.email ?? '' })}
            </p>
            <p className="text-caption text-ink-muted">{t('checkSpam')}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            icon={<RotateCcw aria-hidden="true" strokeWidth={1.5} />}
            onClick={() => sub.reset()}
          >
            {t('again')}
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="relative flex flex-col gap-4">
          <p className="text-ink-muted text-small">{t(ROLE_LINE[role])}</p>
          <div className={cn('grid gap-4', !compact && 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end')}>
            <TextField
              ref={emailRef}
              label={t('email')}
              type="email"
              autoComplete="email"
              spellCheck={false}
              enterKeyHint="send"
              value={email}
              onChange={(e) => edit(e.currentTarget.value)}
              error={invalid ? t('emailInvalid') : undefined}
              data-testid="subscribe-email"
            />
            <fieldset className="min-w-0">
              <legend className="mb-1.5 font-medium text-ink text-small">{t('mailLang')}</legend>
              <div className="grid h-11 grid-cols-2 gap-1 rounded-full border border-line bg-surface-2 p-1">
                {LANGS.map((o) => (
                  <label key={o.value} lang={o.value} className={RADIO}>
                    <input
                      type="radio"
                      name={radioName}
                      value={o.value}
                      checked={mailLang === o.value}
                      onChange={() => setChosen(o.value)}
                      className="sr-only"
                    />
                    {tu(o.label)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {/*
            The bot trap of spec §9.6: no person sees it, a keyboard skips it, assistive technology and password
            managers ignore it. Uncontrolled and read at submit, so a bot that sets the value without an event is
            caught too. The backend answers a filled trap with the same 202 and sends nothing.
          */}
          <div aria-hidden="true" className="-left-[9999px] absolute top-0 size-px overflow-hidden">
            <label>
              Website
              <input
                ref={trapRef}
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                data-1p-ignore=""
                data-lpignore="true"
              />
            </label>
          </div>
          {sub.isError ? (
            <InlineError id={errorId}>
              <span data-testid="subscribe-error">{t(subscribeFailKey(sub.error))}</span>
            </InlineError>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Button
              type="submit"
              variant="primary"
              loading={sub.isPending}
              loadingLabel={t('sending')}
              icon={<Mail aria-hidden="true" strokeWidth={1.5} />}
              aria-describedby={sub.isError ? errorId : undefined}
              data-testid="subscribe-send"
              className="w-full shrink-0 sm:w-auto"
            >
              {t('send')}
            </Button>
            <p className="text-caption text-ink-muted">
              {t('privacy')}{' '}
              <NavLink href={ROUTES.privacy} prefetch={false} className={LINK}>
                {tu('footerPrivacy')}
              </NavLink>
            </p>
          </div>
        </form>
      )}
      <p aria-live="polite" className="sr-only" data-testid="subscribe-live">
        {said.text ? <span key={said.n}>{said.text}</span> : null}
      </p>
    </Shell>
  );
}
