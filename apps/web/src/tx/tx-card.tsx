'use client';

import { Ban, Check, ChevronDown, Signature, Smartphone, Wallet, X } from 'lucide-react';
import * as m from 'motion/react-m';
import { type ReactNode, useId } from 'react';
import { CHAIN_ID } from '@/chain/hooks';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import { explorerTx } from '@/lib/links';
import { messages } from '@/messages/tx.messages';
import { messages as walletMessages } from '@/messages/wallet.messages';
import { SPRING } from '@/motion/tokens';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { ExternalLink } from '@/ui/external-link';
import { HoldButton } from '@/ui/hold-button';
import { Spinner } from '@/ui/spinner';
import { UntrustedText } from '@/ui/untrusted-text';
import { connectSheet } from '@/wallet/connect-sheet-slot';
import { networkName } from '@/wallet/network';
import { ErrorBox } from './error-box';
import { TxProgress } from './tx-progress';
import { type StepPhase, type StepRow, warningKey } from './tx-view';
import type { TxRunner } from './use-tx-runner';

const PHASE = {
  ready: { key: 'phaseReady', tone: 'text-ink-muted' },
  skipped: { key: 'phaseReady', tone: 'text-ink-muted' },
  blocked: { key: 'phaseBlocked', tone: 'text-danger' },
  signing: { key: 'phaseSigning', tone: 'text-thread' },
  pending: { key: 'phasePending', tone: 'text-thread' },
  confirmed: { key: 'phaseConfirmed', tone: 'text-alive' },
  failed: { key: 'phaseFailed', tone: 'text-danger' },
} as const satisfies Record<StepPhase, { key: string; tone: string }>;

const MARKER: Record<StepPhase, string> = {
  ready: 'border-line-strong bg-surface-1 text-ink-muted',
  skipped: 'border-line-strong bg-surface-1 text-ink-muted',
  blocked: 'border-danger/45 bg-danger/8 text-danger',
  signing: 'border-thread bg-surface-1 text-thread',
  pending: 'border-thread bg-surface-1 text-thread',
  confirmed: 'border-thread bg-thread text-on-thread',
  failed: 'border-danger bg-danger text-on-danger',
};

const inWallet = (p: StepPhase) => p === 'signing' || p === 'pending';

/** A knot on the thread: the step number, a turning arc while the wallet or the chain works, then a check or a cross. */
function StepMarker({ row }: { row: StepRow }) {
  const icon =
    row.phase === 'confirmed' ? (
      <Check size={16} strokeWidth={2} />
    ) : row.phase === 'failed' ? (
      <X size={16} strokeWidth={2} />
    ) : row.phase === 'blocked' ? (
      <Ban size={16} strokeWidth={1.5} />
    ) : (
      row.index + 1
    );
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border font-mono text-small tabular-nums',
        'transition-colors duration-300',
        MARKER[row.phase],
      )}
    >
      {inWallet(row.phase) ? (
        <Spinner size={16} />
      ) : (
        <m.span
          key={row.phase}
          className="inline-flex"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING}
        >
          {icon}
        </m.span>
      )}
    </span>
  );
}

function StepItem({
  row,
  last,
  explorer,
  testId,
}: {
  row: StepRow;
  last: boolean;
  explorer: string | null;
  testId: string;
}) {
  const t = useT(messages);
  const phase = PHASE[row.phase];
  const sim = row.simulation === 'ok' ? t('simOk') : row.simulation === 'failed' ? t('simFailed') : t('simSkipped');
  return (
    <li
      data-testid={`${testId}-step-${row.index}`}
      data-phase={row.phase}
      className="relative flex gap-4 pb-5 last:pb-0"
    >
      {last ? null : (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-9 bottom-1 left-[15.5px] w-px transition-colors duration-500',
            row.phase === 'confirmed' ? 'bg-thread' : 'bg-line',
          )}
        />
      )}
      <StepMarker row={row} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <p className="text-body text-ink">{row.summary}</p>
        <p className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-small', phase.tone)}>
          <span>{t(phase.key)}</span>
          {row.hash && explorer ? (
            <ExternalLink href={explorerTx(explorer, row.hash)} className="text-ink-muted">
              {t('viewTx')}
            </ExternalLink>
          ) : null}
          {row.hash && !explorer ? (
            <code className="break-all font-mono text-caption text-ink-muted">{row.hash}</code>
          ) : null}
        </p>
        <details className="group mt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-caption text-ink-muted transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden">
            {t('details')}
            <ChevronDown
              aria-hidden="true"
              size={14}
              strokeWidth={1.5}
              className="transition-transform duration-150 group-open:rotate-180"
            />
          </summary>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-xl bg-surface-2/60 p-3 text-small">
            <dt className="text-ink-muted">{t('contract')}</dt>
            <dd className="min-w-0">
              <Address address={row.to} size="sm" avatar={false} explorer={explorer} />
            </dd>
            <dt className="text-ink-muted">{t('fn')}</dt>
            <dd>
              <code className="font-mono text-ink">{row.action}</code>
            </dd>
            <dt className="text-ink-muted">{t('check')}</dt>
            <dd className="text-ink">{sim}</dd>
            <dt className="text-ink-muted">{t('gas')}</dt>
            <dd className="font-mono text-ink tabular-nums">
              {row.gas !== null ? `≈ ${formatAmount(row.gas, 0)}` : row.simulation === 'failed' ? '—' : t('noGas')}
            </dd>
          </dl>
        </details>
      </div>
    </li>
  );
}

export interface TxCardProps {
  runner: TxRunner;
  /** The send button, for example "Create vault". */
  label: string;
  title?: ReactNode;
  /** `hold`: a HoldButton (600 ms, or Enter) for the actions the spec makes a ritual, such as the check-in. */
  confirm?: 'click' | 'hold';
  /** `danger` for a plan that cannot be undone. */
  tone?: 'thread' | 'danger';
  testId?: string;
  className?: string;
}

/** A prepared plan, step by step: what each step does, what the simulation said, and where the wallet is. */
export function TxCard({
  runner,
  label,
  title,
  confirm = 'click',
  tone = 'thread',
  testId = 'tx',
  className,
}: TxCardProps) {
  const t = useT(messages);
  const tw = useT(walletMessages);
  const headingId = useId();
  const { plan, view, busy, result, blocker, offset } = runner;
  const active = view.rows.find((r) => inWallet(r.phase));
  const announce = result
    ? t('done')
    : active
      ? t('live', { n: active.index + 1, total: view.total, status: t(PHASE[active.phase].key) })
      : '';
  const sendLabel = busy
    ? t('sending')
    : blocker === 'loading'
      ? t('preparing')
      : offset > 0
        ? t('resume', { n: offset + 1 })
        : label;

  let action: ReactNode;
  if (result) {
    action = (
      <Banner tone="success" testId={`${testId}-done`}>
        {t('done')}
      </Banner>
    );
  } else if (blocker === 'connect') {
    action = (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-muted text-small">{t('connectFirst')}</p>
        <Button
          variant="primary"
          data-testid={`${testId}-connect`}
          onClick={runner.connect}
          // runner.connect opens the wallet sheet; its chunk loads now if the idle preload has not loaded it yet.
          onPointerEnter={connectSheet.preload}
          onFocus={connectSheet.preload}
          icon={<Wallet aria-hidden="true" strokeWidth={1.5} />}
        >
          {tw('connect')}
        </Button>
      </div>
    );
  } else if (blocker === 'wrongAccount') {
    action = (
      <Banner tone="error" title={t('wrongAccountTitle')} testId={`${testId}-wrong-account`}>
        <p>{t('wrongAccount')}</p>
        <Address address={plan.from} size="sm" className="mt-2" />
      </Banner>
    );
  } else {
    action = (
      <div className={cn('flex flex-col gap-2', confirm === 'hold' ? 'items-center' : 'items-stretch sm:items-end')}>
        {confirm === 'hold' ? (
          <HoldButton
            data-testid={`${testId}-send`}
            tone={tone}
            disabled={busy || blocker !== null}
            onConfirm={runner.send}
          >
            {sendLabel}
          </HoldButton>
        ) : (
          <Button
            data-testid={`${testId}-send`}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="lg"
            loading={busy || (blocker === 'loading' && runner.error === null)}
            disabled={blocker !== null}
            onClick={runner.send}
            icon={<Signature aria-hidden="true" strokeWidth={1.5} />}
            className="w-full sm:w-auto"
          >
            {sendLabel}
          </Button>
        )}
        {runner.switchFirst ? (
          <p className="text-caption text-ink-muted">{t('switchFirst', { network: networkName(CHAIN_ID) })}</p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      data-testid={testId}
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6', className)}
    >
      <header className="flex flex-col gap-1.5">
        <h3 id={headingId} className="font-display text-ink text-title">
          {title ?? t('title')}
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted text-small">
          <span>{view.total === 1 ? t('stepsOne') : t('stepsMany', { n: view.total })}</span>
          <span aria-hidden="true">·</span>
          <span>{t('signer')}</span>
          <Address address={plan.from} size="sm" copy={false} />
        </div>
      </header>

      {view.total > 1 ? <TxProgress rows={view.rows} testId={`${testId}-progress`} /> : null}

      {view.warnings.length > 0 ? (
        <div className="flex flex-col gap-2">
          {view.warnings.map((w) => (
            <Banner key={warningKey(w)} tone="warn" testId={`warning-${w.code}`}>
              <UntrustedText value={w.message} max={280} />
            </Banner>
          ))}
        </div>
      ) : null}

      <ol aria-label={t('what')} className="flex flex-col">
        {view.rows.map((r, i) => (
          <StepItem
            key={r.index}
            row={r}
            last={i === view.rows.length - 1}
            explorer={runner.explorer}
            testId={testId}
          />
        ))}
      </ol>

      {view.blockedError ? <ErrorBox error={view.blockedError} /> : null}
      <ErrorBox error={runner.error} onRetry={blocker === 'loading' ? runner.reload : undefined} />

      <footer className="flex flex-col gap-3 border-line border-t pt-5">{action}</footer>

      {runner.handoffLink ? (
        <details className="group rounded-2xl border border-line bg-surface-2/40">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-ink text-small [&::-webkit-details-marker]:hidden">
            <Smartphone aria-hidden="true" size={16} strokeWidth={1.5} className="text-ink-muted" />
            <span className="flex-1">{t('handoffTitle')}</span>
            <ChevronDown
              aria-hidden="true"
              size={16}
              strokeWidth={1.5}
              className="text-ink-muted transition-transform duration-150 group-open:rotate-180"
            />
          </summary>
          <div className="flex flex-col items-start gap-3 px-4 pb-4">
            <p className="text-ink-muted text-small">{t('handoffBody')}</p>
            <span data-testid={`${testId}-copy-link`} className="inline-flex">
              <CopyButton
                text={runner.handoffLink}
                label={t('copyLink')}
                showText
                className="border border-line-strong"
              />
            </span>
          </div>
        </details>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  );
}
