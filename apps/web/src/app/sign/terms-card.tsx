'use client';

import type { CreateTerms } from '@atropyle/sdk';
import { useLang, useT } from '@/i18n/provider';
import { durationWords } from '@/lib/duration';
import { formatBps, formatTimestamp } from '@/lib/format';
import { messages as labels } from '@/messages/labels.messages';
import { messages } from '@/messages/sign.messages';
import { Address } from '@/ui/address';

/**
 * Who gets what and how early, as the SDK decoded it from the createVault calldata. The SDK refuses a second
 * createVault, a vault that already exists and any later call to that vault in the same link, so these terms are
 * final once signed. The heirs and guardians have no copy button: a Drill link asks the signer to type them again
 * from their own records, and a button beside each one would invite copying them from this page instead.
 */
export function TermsCard({ index, terms, explorer }: { index: number; terms: CreateTerms; explorer: string | null }) {
  const t = useT(messages);
  const l = useT(labels);
  const { lang } = useLang();
  const words = (s: number | bigint) => durationWords(s, lang);
  const e = terms.exit;
  const id = `sign-terms-${index}`;
  const tm = terms.timing;
  return (
    <section
      data-testid={id}
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6"
    >
      <header className="flex flex-col gap-3">
        <h2 id={`${id}-title`} className="flex flex-wrap items-center gap-2 font-display text-ink text-title">
          {t('termsTitle', { n: index + 1 })}
          {terms.drill ? (
            <span className="rounded-full border border-grace/45 bg-grace/8 px-2 py-0.5 font-sans text-caption text-ink">
              {l('drill')}
            </span>
          ) : null}
        </h2>
        <Address address={terms.vault} explorer={explorer} />
      </header>

      {e.earliest && terms.earliestAt !== null ? (
        <p
          data-testid={`${id}-earliest`}
          data-after={String(e.earliest.after)}
          data-route={e.earliest.route}
          className="rounded-2xl border border-grace/45 bg-grace/8 p-4 font-medium text-body text-ink"
        >
          {t('earliest', { time: words(e.earliest.after), date: formatTimestamp(terms.earliestAt) })}
        </p>
      ) : (
        <p
          data-testid={`${id}-earliest`}
          data-after="none"
          className="rounded-2xl border border-line bg-surface-2/60 p-4 font-medium text-body text-ink"
        >
          {t('earliestNone')}
        </p>
      )}
      {terms.drill && e.expiresAfter !== null ? (
        <p className="text-ink-muted text-small">{t('termsDrill', { time: words(e.expiresAfter) })}</p>
      ) : null}

      {e.routes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium font-sans text-ink text-small">{t('routesTitle')}</h3>
          <ul data-testid={`${id}-routes`} className="flex flex-col gap-2 text-ink text-small">
            {e.routes.map((r) => {
              const time = words(r.after);
              const text =
                r.route === 'recovery'
                  ? t('routeRecovery', { time, k: r.guardians })
                  : r.route === 'heirsFallback'
                    ? t('routeFallback', { time })
                    : r.guardians === 0
                      ? t('routeHeirs', { time })
                      : t('routeHeirsGuardians', { time, k: r.guardians });
              return (
                <li key={r.route} data-route={r.route} data-after={String(r.after)} className="ps-4 -indent-4">
                  <span aria-hidden="true" className="me-2 text-ink-muted">
                    ·
                  </span>
                  {text}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="font-medium font-sans text-ink text-small">{t('heirsTitle')}</h3>
        <ul data-testid={`${id}-heirs`} className="flex flex-col gap-2">
          {terms.heirs.map((h) => (
            // The share leads its row, so the shares read as one column and never leave their heir at any width.
            <li key={h.account} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3">
              <span className="font-mono text-body text-ink tabular-nums">{formatBps(h.bps)}</span>
              <Address address={h.account} size="sm" copy={false} />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium font-sans text-ink text-small">{t('guardiansTitle')}</h3>
        {terms.guardians.length === 0 ? (
          <p data-testid={`${id}-guardians`} className="text-ink-muted text-small">
            {t('guardiansNone')}
          </p>
        ) : (
          <div data-testid={`${id}-guardians`} className="flex flex-col gap-2">
            <ul className="flex flex-col gap-2">
              {terms.guardians.map((g) => (
                <li key={g}>
                  <Address address={g} size="sm" copy={false} />
                </li>
              ))}
            </ul>
            <p className="text-ink text-small">
              {t(terms.recoveryEnabled ? 'guardiansOn' : 'guardiansOff', { k: terms.k, n: terms.guardians.length })}
            </p>
          </div>
        )}
      </div>

      <p className="text-ink-muted text-small">
        {t('timingLine', { period: words(tm.period), threshold: tm.threshold, window: words(tm.window) })}
      </p>
    </section>
  );
}
