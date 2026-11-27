'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Address as Addr } from 'viem';
import { CHAIN_ID } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
import type { Sdk } from '@/chain/types';
import type { ConfigPart, HistoryKind, HistoryRow, HistoryTx } from '@/flows/impl/history';
import type { FlowsImpl } from '@/flows/load';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import { explorerName, explorerTx } from '@/lib/links';
import { chainDate, isoDate } from '@/lib/when';
import { messages } from '@/messages/history.messages';
import { StateBadge } from '@/thread/state-badge';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { Button } from '@/ui/button';
import { ExternalLink } from '@/ui/external-link';
import { SkeletonText } from '@/ui/skeleton';
import { VisuallyHidden } from '@/ui/visually-hidden';

type HistoryKey = keyof typeof messages.en;

const CONFIG_KEY = {
  heirs: 'configHeirs',
  guardians: 'configGuardians',
  timing: 'configTiming',
  assets: 'configAssets',
} as const satisfies Record<ConfigPart, HistoryKey>;

const KNOT: Record<HistoryKind, string> = {
  checkIn: 'bg-alive',
  config: 'bg-line-strong',
  attest: 'bg-grace',
  vote: 'bg-recovery',
  alarm: 'bg-grace',
  cancel: 'bg-alive',
  release: 'bg-release',
  transfers: 'bg-release',
  decided: 'bg-thread',
};

const LINE = 'flex flex-wrap items-center gap-2';

function RowBody({ row }: { row: HistoryRow }) {
  const t = useT(messages);
  switch (row.kind) {
    case 'checkIn':
      return <p>{t('checkIn')}</p>;
    case 'config':
      return <p>{t(row.part ? CONFIG_KEY[row.part] : 'configOther')}</p>;
    case 'attest':
      return (
        <p className={LINE}>
          {t(row.on ? 'attestOn' : 'attestOff')} <Address address={row.guardian} size="sm" />
        </p>
      );
    case 'vote':
      return row.target ? (
        <p className={LINE}>
          {t('vote')} <Address address={row.target} size="sm" />
          <span className="text-ink-muted">{t('voteBy')}</span> <Address address={row.guardian} size="sm" />
        </p>
      ) : (
        <p className={LINE}>
          {t('voteWithdrawn')} <Address address={row.guardian} size="sm" />
        </p>
      );
    case 'alarm':
      return row.state === 'recovery' && row.target ? (
        <p className={LINE}>
          {t('alarmRecovery')} <Address address={row.target} size="sm" />
        </p>
      ) : (
        <p>{t('alarm')}</p>
      );
    case 'cancel':
      return <p>{t(row.byOwner ? 'cancelOwner' : 'cancelOther')}</p>;
    case 'release':
      return row.state === 'releasedRecover' && row.target ? (
        <p className={LINE}>
          {t('releaseRecover')} <Address address={row.target} size="sm" />
        </p>
      ) : (
        <p>{t('releaseInherit')}</p>
      );
    case 'transfers':
      return <p>{t('transfers', { sent: row.sent, failed: row.failed })}</p>;
  }
}

/** One transaction: what it did, what the circuit decided in it (spec §18.4.2 T9), when, and where to check it. */
export function HistoryEntry({ tx, index, explorer }: { tx: HistoryTx; index: number; explorer: string | null }) {
  const t = useT(messages);
  const { lang } = useLang();
  const kind: HistoryKind = tx.rows[0]?.kind ?? 'decided';
  const id = `vault-history-${index}`;
  return (
    <li data-testid={id} data-kind={kind} data-hash={tx.hash} className="relative">
      <span
        aria-hidden="true"
        className={cn('absolute top-2 -left-[calc(1.5rem+7px)] size-3 rounded-full ring-4 ring-bg', KNOT[kind])}
      />
      <div className="flex flex-col gap-1.5 text-body text-ink">
        {tx.rows.map((r) => (
          <RowBody key={r.logIndex} row={r} />
        ))}
        {tx.decided.map((c, j) => (
          <p
            // One poke moves the state once: a transition is unique within its transaction.
            key={`${c.from}-${c.to}`}
            data-testid={`${id}-decided-${j}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-muted"
          >
            <span>{t('decided')}</span>
            {/* As in the Receipt: where two long badges do not fit, the second line starts with the arrow. */}
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <StateBadge state={c.from} size="sm" />
              <span className="inline-flex items-center gap-2">
                <ArrowRight aria-hidden="true" size={14} strokeWidth={1.5} />
                <VisuallyHidden>{t('decidedTo')}</VisuallyHidden>
                <StateBadge state={c.to} size="sm" />
              </span>
            </span>
          </p>
        ))}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
        {tx.at !== null ? (
          <time dateTime={isoDate(tx.at)}>{chainDate(tx.at, lang, true)}</time>
        ) : (
          <span className="voice-ledger">{t('block', { block: formatAmount(tx.blockNumber, 0) })}</span>
        )}
        {explorer ? (
          <ExternalLink href={explorerTx(explorer, tx.hash)}>
            {t('viewTx', { name: explorerName(explorer) })}
          </ExternalLink>
        ) : null}
      </p>
    </li>
  );
}

/**
 * Spec §5.3: the vault's transactions on a thread of their own (the header draws no check-in knots), read on demand,
 * one window of HISTORY_BLOCKS at a time (Quyết định 8). A refresh of the page resets this query (useVaultRefresh).
 */
export function HistoryThread({ flows, sdk, vault }: { flows: FlowsImpl; sdk: Sdk; vault: Addr }) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const explorer = sdk.deployment.explorerUrl;
  const q = useInfiniteQuery({
    queryKey: chainKeys.history(CHAIN_ID, vault),
    queryFn: ({ pageParam }) =>
      flows.historyWindow(sdk.atro, vault, pageParam === null ? null : BigInt(pageParam), sdk.deployment.factoryBlock),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.more ? String(last.fromBlock - 1n) : undefined),
    enabled: open,
    // Entries hold bigints; a window read once never changes (a refresh resets the whole query instead).
    structuralSharing: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const txs = q.data?.pages.flatMap((p) => p.txs) ?? [];
  return (
    <section
      aria-labelledby="vault-history-title"
      aria-busy={open && q.isPending ? true : undefined}
      data-testid="vault-history"
      className="flex flex-col gap-4"
    >
      <h2
        id="vault-history-title"
        ref={heading}
        tabIndex={-1}
        className="text-title text-ink focus-visible:outline-2 focus-visible:outline-thread"
      >
        {t('title')}
      </h2>
      <p className="text-small text-ink-muted">{t('intro', { blocks: formatAmount(flows.HISTORY_BLOCKS, 0) })}</p>
      {!open ? (
        <Button
          variant="secondary"
          className="self-start"
          data-testid="vault-history-load"
          onClick={() => {
            setOpen(true);
            // The button leaves the page: focus stays in the section.
            heading.current?.focus();
          }}
        >
          {t('load')}
        </Button>
      ) : q.isPending ? (
        <div>
          <p className="sr-only">{t('loading')}</p>
          <SkeletonText lines={4} />
        </div>
      ) : q.isError && txs.length === 0 ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} testId="vault-history-error" />
      ) : (
        <>
          {txs.length === 0 ? (
            <p data-testid="vault-history-empty" className="text-body text-ink-muted">
              {t('empty')}
            </p>
          ) : (
            <ol className="flex flex-col gap-5 border-line border-l-2 pl-6">
              {txs.map((x, i) => (
                <HistoryEntry key={x.hash} tx={x} index={i} explorer={explorer} />
              ))}
            </ol>
          )}
          {q.isFetchNextPageError ? (
            <ErrorBox error={q.error} onRetry={() => void q.fetchNextPage()} testId="vault-history-more-error" />
          ) : null}
          {q.hasNextPage ? (
            <Button
              variant="ghost"
              className="self-start"
              data-testid="vault-history-more"
              loading={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              {t('more')}
            </Button>
          ) : (
            <p data-testid="vault-history-end" className="text-caption text-ink-muted">
              {t('end')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
