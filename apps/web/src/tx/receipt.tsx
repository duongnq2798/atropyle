'use client';

import { ArrowRight, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount, formatTimestamp } from '@/lib/format';
import { explorerName, explorerTx } from '@/lib/links';
import { messages } from '@/messages/tx-flow.messages';
import { StateBadge } from '@/thread/state-badge';
import { CopyButton } from '@/ui/copy-button';
import { ExternalLink } from '@/ui/external-link';
import { VisuallyHidden } from '@/ui/visually-hidden';
import { hashGroups, type ReceiptStep, receiptGroups, stateChanges } from './receipt-view';

/** Label above value in a narrow receipt, side by side from 24rem (the box is the container). */
const FIELDS =
  'grid grid-cols-1 gap-y-0.5 @sm:grid-cols-[auto_minmax(0,1fr)] @sm:items-baseline @sm:gap-x-4 @sm:gap-y-1';
const LABEL = 'mt-2 text-ink-muted first:mt-0 @sm:mt-0';

function localTime(ts: bigint, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(Number(ts) * 1000),
  );
}

/**
 * The hash in groups of four on a fixed grid, never free wrapping: "0x" hangs in column 1 (muted, as in Address) and
 * every row of groups starts in column 2. Four rows of four in a narrow receipt, two rows of eight from a 32rem
 * receipt, so no group sits alone on a line and two hashes compare row by row. The drawn grid is aria-hidden; a
 * screen reader reads the hash once, whole, from the hidden copy beside it.
 */
function TxHash({ hash }: { hash: string }) {
  const parts = hashGroups(hash).map((text, at) => ({ text, at }));
  return (
    <span className="inline-flex min-w-0 max-w-full">
      <span
        aria-hidden="true"
        translate="no"
        data-part="hash"
        className="voice-ledger inline-grid select-none grid-cols-[2ch_repeat(4,4ch)] gap-x-[0.45ch] gap-y-0.5 @lg:grid-cols-[2ch_repeat(8,4ch)]"
      >
        <span className="text-ink-muted">0x</span>
        {parts.map((p) => (
          <span
            key={p.at}
            className={cn(
              // Group 8 starts a row in both grids, groups 4 and 12 only in the grid of four.
              p.at === 8 && 'col-start-2',
              p.at % 8 === 4 && 'col-start-2 @lg:col-start-auto',
            )}
          >
            {p.text}
          </span>
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
}

/**
 * The done state of TxCard: in plain words what each step did, behind a tied knot, what the circuit decided (each
 * StateChanged as two StateBadges), then where to check it: block, chain time in UTC and in the reader's time, the
 * transaction, OKLink. No heading of its own: the card's heading says it is done, so each fact is said once.
 *
 * Each step line carries the id and the phase its row had (`${testId}-step-<i>`, `confirmed`). The box is a size
 * container: in a narrow receipt (a phone) each label sits above its value, as in MirrorBox, so the hash keeps the
 * width for its grid of four; from 24rem label and value sit side by side.
 */
export function Receipt({ steps, titles, explorer, reading = false, testId = 'tx', footer }: ReceiptProps) {
  const t = useT(messages);
  const { lang } = useLang();
  return (
    <div
      data-testid={`${testId}-done`}
      className="@container flex flex-col gap-4 rounded-2xl border border-alive/45 bg-alive/8 p-4 text-small"
    >
      <ol className="flex flex-col gap-4">
        {receiptGroups(steps).map((g) => (
          <li
            key={g.hash}
            data-testid={`${testId}-receipt-${g.steps[0]?.index ?? 0}`}
            data-hash={g.hash}
            className="flex flex-col gap-2 border-alive/30 border-t pt-3 first:border-t-0 first:pt-0"
          >
            {g.steps.map((s) => (
              <p
                key={s.index}
                data-testid={`${testId}-step-${s.index}`}
                data-phase="confirmed"
                className="flex items-start gap-2 text-body text-ink"
              >
                {/* A tied knot, as on the thread; it stays on the first line of a title that wraps. */}
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-thread text-on-thread"
                >
                  <Check size={12} strokeWidth={2} />
                </span>
                <span className="min-w-0 text-balance">{titles[s.index] ?? s.action}</span>
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
            <dl className={FIELDS}>
              {g.blockNumber !== null ? (
                <>
                  <dt className={LABEL}>{t('receiptBlock')}</dt>
                  <dd className="voice-ledger text-ink">{formatAmount(g.blockNumber, 0)}</dd>
                </>
              ) : null}
              <dt className={LABEL}>{t('receiptChainTime')}</dt>
              <dd className="voice-ledger text-ink">
                {g.time !== null ? formatTimestamp(g.time) : reading ? t('receiptReading') : '—'}
              </dd>
              {g.time !== null ? (
                <>
                  <dt className={LABEL}>{t('receiptLocalTime')}</dt>
                  <dd className="text-ink">{localTime(g.time, lang)}</dd>
                </>
              ) : null}
              <dt className={LABEL}>{t('receiptTx')}</dt>
              {/* items-start: the copy button stands beside the first row of the hash, not in the middle of four. */}
              <dd className="flex min-w-0 items-start gap-2">
                <TxHash hash={g.hash} />
                <span className="-my-1.5 inline-flex shrink-0">
                  <CopyButton text={g.hash} label={t('receiptCopy')} />
                </span>
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
