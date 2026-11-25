'use client';

import { ArrowRight, CircleCheck } from 'lucide-react';
import { Fragment, type ReactNode, type Ref } from 'react';
import { useLang, useT } from '@/i18n/provider';
import { formatAmount, formatTimestamp } from '@/lib/format';
import { explorerName, explorerTx } from '@/lib/links';
import { messages } from '@/messages/tx-flow.messages';
import { StateBadge } from '@/thread/state-badge';
import { CopyButton } from '@/ui/copy-button';
import { ExternalLink } from '@/ui/external-link';
import { VisuallyHidden } from '@/ui/visually-hidden';
import { hashGroups, type ReceiptStep, receiptGroups, stateChanges } from './receipt-view';

function localTime(ts: bigint, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(Number(ts) * 1000),
  );
}

/** The hash in groups of four, aria-hidden, and once in full for a screen reader. */
function TxHash({ hash }: { hash: string }) {
  const parts = hashGroups(hash).map((text, at) => ({ text, at }));
  return (
    <span className="inline-flex min-w-0 max-w-full">
      <span aria-hidden="true" data-part="hash" className="voice-ledger wrap-anywhere select-none">
        0x
        {parts.map((p) => (
          <Fragment key={p.at}>
            {p.at > 0 ? <wbr /> : null}
            <span className="pr-[0.35ch]">{p.text}</span>
          </Fragment>
        ))}
      </span>
      <VisuallyHidden>{hash}</VisuallyHidden>
    </span>
  );
}

export interface ReceiptProps {
  steps: readonly ReceiptStep[];
  /** The plain title of every step of the plan, by index (stepTitleKey). */
  titles: readonly string[];
  explorer: string | null;
  /** Blocks or times are still being read. */
  reading?: boolean;
  testId?: string;
  /** The page's next step, for example a link to the vault. */
  footer?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The done state of TxCard: in plain words what each step did, what the circuit decided (each StateChanged as two
 * StateBadges), then where to check it: block, chain time in UTC and in the reader's time, the transaction, OKLink.
 */
export function Receipt({ steps, titles, explorer, reading = false, testId = 'tx', footer, headingRef }: ReceiptProps) {
  const t = useT(messages);
  const { lang } = useLang();
  return (
    <div
      data-testid={`${testId}-done`}
      className="flex flex-col gap-4 rounded-2xl border border-alive/45 bg-alive/8 p-4 text-small"
    >
      <h4
        ref={headingRef}
        tabIndex={-1}
        className="flex items-center gap-2 font-medium text-body text-ink outline-none"
      >
        <CircleCheck aria-hidden="true" size={18} strokeWidth={1.5} className="shrink-0 text-alive" />
        {t('receiptTitle')}
      </h4>
      <ol className="flex flex-col gap-4">
        {receiptGroups(steps).map((g) => (
          <li
            key={g.hash}
            data-testid={`${testId}-receipt-${g.steps[0]?.index ?? 0}`}
            data-hash={g.hash}
            className="flex flex-col gap-2 border-alive/30 border-t pt-3 first:border-t-0 first:pt-0"
          >
            {g.steps.map((s) => (
              <p key={s.index} className="text-body text-ink">
                {titles[s.index] ?? s.action}
              </p>
            ))}
            {stateChanges(g.events)
              .map((c, at) => ({ ...c, at }))
              .map((c) => (
                <p
                  key={c.at}
                  data-testid={`${testId}-decided`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted"
                >
                  <span>{t('receiptDecided')}</span>
                  {/* The change reads as one unit after the label; where two long badges do not fit (Vietnamese on a
                      phone), the second line starts with the arrow, never with a lone badge or a lone arrow. */}
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StateBadge state={c.from} size="sm" />
                    <span className="inline-flex items-center gap-2">
                      <ArrowRight aria-hidden="true" size={14} strokeWidth={1.5} />
                      <VisuallyHidden>{t('receiptTo')}</VisuallyHidden>
                      <StateBadge state={c.to} size="sm" />
                    </span>
                  </span>
                </p>
              ))}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1">
              {g.blockNumber !== null ? (
                <>
                  <dt className="text-ink-muted">{t('receiptBlock')}</dt>
                  <dd className="voice-ledger text-ink">{formatAmount(g.blockNumber, 0)}</dd>
                </>
              ) : null}
              <dt className="text-ink-muted">{t('receiptChainTime')}</dt>
              <dd className="voice-ledger text-ink">
                {g.time !== null ? formatTimestamp(g.time) : reading ? t('receiptReading') : '—'}
              </dd>
              {g.time !== null ? (
                <>
                  <dt className="text-ink-muted">{t('receiptLocalTime')}</dt>
                  <dd className="text-ink">{localTime(g.time, lang)}</dd>
                </>
              ) : null}
              <dt className="text-ink-muted">{t('receiptTx')}</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <TxHash hash={g.hash} />
                <CopyButton text={g.hash} label={t('receiptCopy')} />
              </dd>
            </dl>
            {explorer ? (
              <ExternalLink href={explorerTx(explorer, g.hash)} className="min-h-6 self-start">
                {t('receiptView', { name: explorerName(explorer) })}
              </ExternalLink>
            ) : null}
          </li>
        ))}
      </ol>
      {footer ? <div className="flex flex-wrap items-center gap-3">{footer}</div> : null}
    </div>
  );
}
