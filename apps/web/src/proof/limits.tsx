'use client';

import { ShieldCheck } from 'lucide-react';
import { COMMANDS, STEP_EXAMPLE } from '@/content/commands';
import { useLang, useT } from '@/i18n/provider';
import { formatCount } from '@/lib/count';
import { messages } from '@/messages/proof.messages';
import { ROUTES } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { CommandLine } from '@/ui/command-line';
import { ExternalLink } from '@/ui/external-link';
import { P9_CASES } from './certificate';
import { LIMIT_LINKS } from './limit-links';
import { TOTAL_CASES } from './paint';

type Key = keyof typeof messages.en;

interface Row {
  title: Key;
  body: Key;
  protect: Key;
  links: readonly { href: string; label: Key; internal?: true }[];
  command?: true;
}

/** Spec §18.4.3 (Task 3), ruling R21 and the 7C main sync: six parts the proof does not check, each with its defence. */
const ROWS: readonly Row[] = [
  {
    title: 'limit1Title',
    body: 'limit1Body',
    protect: 'limit1Do',
    links: [
      { href: LIMIT_LINKS.security, label: 'limit1Link' },
      { href: LIMIT_LINKS.staticAnalysis, label: 'limit1Link2' },
    ],
  },
  {
    title: 'limit2Title',
    body: 'limit2Body',
    protect: 'limit2Do',
    links: [{ href: LIMIT_LINKS.tap02, label: 'limit2Link' }],
    command: true,
  },
  {
    title: 'limit3Title',
    body: 'limit3Body',
    protect: 'limit3Do',
    links: [{ href: LIMIT_LINKS.knownLimits, label: 'limit3Link' }],
  },
  {
    title: 'limit4Title',
    body: 'limit4Body',
    protect: 'limit4Do',
    links: [{ href: LIMIT_LINKS.verifyOptions, label: 'limit4Link' }],
  },
  {
    title: 'limit5Title',
    body: 'limit5Body',
    protect: 'limit5Do',
    links: [{ href: LIMIT_LINKS.disappears, label: 'limit5Link' }],
  },
  // /sign/ comes with Plan 7B: no prefetch until it exists (Quyết định 22).
  {
    title: 'limit6Title',
    body: 'limit6Body',
    protect: 'limit6Do',
    links: [{ href: ROUTES.sign, label: 'limit6Link', internal: true }],
  },
];

const LINK =
  'rounded-sm text-thread underline decoration-thread/40 underline-offset-4 transition-colors duration-150 hover:decoration-thread';

/** `#limits` of /proof/ (R18.7; LIMITS_HREF): the proof line, the footer and the verdict all link here. */
export function Limits() {
  const t = useT(messages);
  const { lang } = useLang();
  const params = {
    total: formatCount(TOTAL_CASES, lang),
    vectors: P9_CASES,
    next: STEP_EXAMPLE.answer.next,
    out: STEP_EXAMPLE.answer.out,
  };
  return (
    <section id="limits" aria-labelledby="limits-title" className="flex scroll-mt-24 flex-col gap-8">
      <header className="flex max-w-3xl flex-col gap-3">
        <h2 id="limits-title" className="font-display text-h2">
          {t('limitsTitle')}
        </h2>
        <p className="text-ink-muted text-lead">{t('limitsLead')}</p>
      </header>
      <ol className="grid gap-4 md:grid-cols-2">
        {ROWS.map((row, i) => (
          <li
            key={row.title}
            data-testid="proof-limit"
            data-limit={i + 1}
            className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface-1 p-5"
          >
            <p aria-hidden="true" className="font-mono text-caption text-ink-muted tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </p>
            <h3 className="font-display text-title">{t(row.title)}</h3>
            <p className="text-small">{t(row.body, params)}</p>
            <div className="flex gap-2 rounded-xl bg-surface-2 p-3 text-small">
              <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-alive" />
              <p>
                <span className="font-medium">{t('limitDo')}</span> {t(row.protect, params)}
              </p>
            </div>
            {row.command ? <CommandLine command={COMMANDS.step} label={t('copyStep')} /> : null}
            <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-small">
              {row.links.map((l) => (
                <li key={l.href}>
                  {l.internal ? (
                    <NavLink href={l.href} prefetch={false} className={LINK}>
                      {t(l.label)}
                    </NavLink>
                  ) : (
                    <ExternalLink href={l.href} className={LINK}>
                      {t(l.label)}
                    </ExternalLink>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p data-testid="proof-limits-close" className="font-display text-title">
        {t('limitsClose')}
      </p>
    </section>
  );
}
