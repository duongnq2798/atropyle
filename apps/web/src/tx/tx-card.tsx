'use client';

import { Ban, Check, ChevronDown, CircleCheck, RotateCcw, Signature, Smartphone, Wallet, X } from 'lucide-react';
import * as m from 'motion/react-m';
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react';
import { CHAIN_ID } from '@/chain/hooks';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import { explorerTx } from '@/lib/links';
import { messages } from '@/messages/tx.messages';
import { messages as flowMessages } from '@/messages/tx-flow.messages';
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
import { stepIsIrreversible } from './irreversible';
import type { MirrorCall } from './mirror';
import { MirrorBox } from './mirror-box';
import { Receipt } from './receipt';
import { receiptGroups } from './receipt-view';
import { stepTitleKey } from './step-title';
import { SummaryText } from './summary-text';
import { TxProgress } from './tx-progress';
import { type StepPhase, type StepRow, warningKey } from './tx-view';
import type { TxRunner } from './use-tx-runner';
import { WarningText } from './warning-text';

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
  title,
  irreversible,
  mirror,
}: {
  row: StepRow;
  last: boolean;
  explorer: string | null;
  testId: string;
  title: string;
  irreversible: boolean;
  mirror: ReactNode;
}) {
  const t = useT(messages);
  const tf = useT(flowMessages);
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-balance text-body text-ink">{title}</p>
          {irreversible ? (
            <span
              data-testid={`${testId}-irreversible-${row.index}`}
              className="inline-flex items-center rounded-full border border-danger/45 px-2 py-0.5 text-caption text-danger"
            >
              {tf('irreversible')}
            </span>
          ) : null}
        </div>
        {/* The SDK's own words, built from addresses and numbers only; English on every page until translated. Its
            addresses come in groups of four, and a line breaks only between groups and words. */}
        <p lang="en" className="text-ink-muted text-small">
          <SummaryText text={row.summary} />
        </p>
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
        {mirror}
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
              {/* The label says "estimate"; no `≈`, which no self-hosted subset has (plan rule 20). */}
              {row.gas !== null ? formatAmount(row.gas, 0) : row.simulation === 'failed' ? '—' : t('noGas')}
            </dd>
          </dl>
        </details>
      </div>
    </li>
  );
}

/**
 * A bundle or a step the wallet took whose outcome this page has not read: it says so and sends nothing again. Its
 * title is what the card's live region says; the banner itself has no role, so it is not read twice.
 */
function Unsettled({
  runner,
  testId,
  recheckRef,
}: {
  runner: TxRunner;
  testId: string;
  recheckRef: Ref<HTMLButtonElement>;
}) {
  const t = useT(messages);
  const tf = useT(flowMessages);
  const u = runner.unsettled;
  if (!u) return null;
  const recheck = (
    <Button
      ref={recheckRef}
      variant="secondary"
      size="sm"
      data-testid={`${testId}-recheck`}
      loading={runner.rechecking}
      onClick={runner.recheck}
      icon={<RotateCcw aria-hidden="true" strokeWidth={1.5} />}
    >
      {tf('recheck')}
    </Button>
  );
  return (
    <div data-testid={`${testId}-unsettled`} data-kind={u.kind}>
      <Banner tone="warn" title={u.kind === 'bundle' ? tf('bundleTitle') : tf('stepUnknownTitle')} action={recheck}>
        {u.kind === 'bundle' ? (
          <>
            <p>{tf('bundleBody')}</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
              <span>{tf('bundleId')}</span>
              {/* The wallet's own text. */}
              <UntrustedText value={u.calls.id} max={80} className="voice-ledger break-all text-ink" />
            </p>
          </>
        ) : (
          <>
            <p>{tf('stepUnknownBody', { n: u.index + 1 })}</p>
            {runner.explorer ? (
              <ExternalLink href={explorerTx(runner.explorer, u.hash)} className="mt-2 min-h-6">
                {t('viewTx')}
              </ExternalLink>
            ) : (
              <code className="mt-2 block break-all font-mono text-caption">{u.hash}</code>
            )}
          </>
        )}
      </Banner>
    </div>
  );
}

/** The first button of an area, when it can be pressed. */
function enabledButton(area: HTMLElement | null): HTMLButtonElement | null {
  const b = area?.querySelector('button');
  return b && !b.disabled ? b : null;
}

/**
 * The control that had focus went away with the state it belonged to (focus fell to <body>), or focus is still in
 * the card: the card may move it. A reader who went elsewhere keeps their place (parked T13 165).
 */
function mayMoveFocus(card: HTMLElement | null): boolean {
  const a = document.activeElement;
  return a === null || a === document.body || card?.contains(a) === true;
}

export interface TxCardProps {
  runner: TxRunner;
  /** The send button, for example "Create vault". */
  label: string;
  title?: ReactNode;
  /** `hold`: a HoldButton (600 ms, or Enter) for the actions the spec makes a ritual, such as the check-in. */
  confirm?: 'click' | 'hold';
  /** `danger` for a plan that cannot be undone (planIsIrreversible). */
  tone?: 'thread' | 'danger';
  /** The page's own gate is closed (on /sign/, a vote not typed again): Send stays disabled. */
  disabled?: boolean;
  /** The Receipt's footer slot: the page's next step, for example a link to the vault. */
  receiptFooter?: ReactNode;
  testId?: string;
  className?: string;
}

/** A prepared plan, step by step: what each step does, what the wallet should show, and where the wallet is. */
export function TxCard({
  runner,
  label,
  title,
  confirm = 'click',
  tone = 'thread',
  disabled = false,
  receiptFooter,
  testId = 'tx',
  className,
}: TxCardProps) {
  const t = useT(messages);
  const tf = useT(flowMessages);
  const tw = useT(walletMessages);
  const headingId = useId();
  // The browser refused to copy the hand-off link (some in-app browsers, a permission policy): it is shown instead.
  const [copyByHand, setCopyByHand] = useState(false);
  const sendArea = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const recheckButton = useRef<HTMLButtonElement>(null);
  // A connection from the card replaces its Connect button: the wallet sheet then gives focus to Send, when it can be
  // pressed, rather than to the wallet button in the header.
  const sendButton = () => enabledButton(sendArea.current);
  const { plan, view, busy, result, blocker, offset, mirror, mode, unsettled } = runner;

  // The Receipt replaces the button that had focus: focus goes to the card's heading, which now says it is done.
  useEffect(() => {
    if (result && mayMoveFocus(section.current)) heading.current?.focus();
  }, [result]);
  // An unsettled outcome replaces Send with Check again, and takes focus to it; once settled without a result (the
  // bundle failed part-way, the step reverted), Send comes back and takes it again. A result is the effect above.
  // Only a change moves focus: a card that mounts in a state keeps the page's focus where it is.
  const isUnsettled = unsettled !== null;
  const wasUnsettled = useRef(isUnsettled);
  useEffect(() => {
    if (wasUnsettled.current === isUnsettled) return;
    wasUnsettled.current = isUnsettled;
    if (result || !mayMoveFocus(section.current)) return;
    if (isUnsettled) recheckButton.current?.focus();
    else (enabledButton(sendArea.current) ?? heading.current)?.focus();
  }, [isUnsettled, result]);

  const callOf = (i: number): MirrorCall | null => mirror?.[i] ?? null;
  const titles = plan.steps.map((s, i) => tf(stepTitleKey(s, callOf(i))));
  // The step the wallet will show next; in a bundle, it and every step after it.
  const next =
    !result && unsettled === null && view.canSend ? view.rows.find((r) => r.phase !== 'confirmed') : undefined;
  const bundleCalls = mode === 'bundle' && next && mirror ? mirror.slice(next.index) : null;
  const stepMirror = (i: number): ReactNode => {
    const c = callOf(i);
    return mode !== 'bundle' && next?.index === i && c ? (
      <MirrorBox calls={[c]} explorer={runner.explorer} testId={testId} wide />
    ) : null;
  };

  const active = view.rows.find((r) => inWallet(r.phase));
  // An unsettled outcome comes first: its rows still say "Confirm in your wallet" or "Waiting for the block".
  const announce = result
    ? t('done')
    : unsettled
      ? tf(unsettled.kind === 'bundle' ? 'bundleTitle' : 'stepUnknownTitle')
      : active
        ? t('live', { n: active.index + 1, total: view.total, status: t(PHASE[active.phase].key) })
        : '';
  // Done, the header counts the transactions the chain recorded: a bundle of steps is one.
  const sent = result && runner.receipt ? receiptGroups(runner.receipt).length : view.total;
  // After a failed load the button stops saying "Preparing…": the error box offers Retry (parked T13 163).
  const preparing = blocker === 'loading' && !runner.loadFailed;
  const sendLabel = busy
    ? t('sending')
    : preparing
      ? t('preparing')
      : offset > 0
        ? t('resume', { n: offset + 1 })
        : label;
  const locked = blocker !== null || disabled;

  let action: ReactNode;
  if (result) {
    action = (
      <Receipt
        steps={runner.receipt ?? []}
        titles={titles}
        explorer={runner.explorer}
        reading={runner.receiptReading}
        testId={testId}
        footer={receiptFooter}
      />
    );
  } else if (blocker === 'unsettled') {
    action = <Unsettled runner={runner} testId={testId} recheckRef={recheckButton} />;
  } else if (blocker === 'connect') {
    action = (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-muted text-small">{t('connectFirst')}</p>
        <Button
          variant="primary"
          data-testid={`${testId}-connect`}
          onClick={() => runner.connect(sendButton)}
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
      <div
        ref={sendArea}
        className={cn('flex flex-col gap-2', confirm === 'hold' ? 'items-center' : 'items-stretch sm:items-end')}
      >
        {confirm === 'hold' ? (
          <HoldButton data-testid={`${testId}-send`} tone={tone} disabled={busy || locked} onConfirm={runner.send}>
            {sendLabel}
          </HoldButton>
        ) : (
          <Button
            data-testid={`${testId}-send`}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="lg"
            loading={busy || preparing}
            disabled={locked}
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
      ref={section}
      data-testid={testId}
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6', className)}
    >
      <header className="flex flex-col gap-1.5">
        {/* tabIndex -1: focus comes here when the plan is done and the button that had it is gone. */}
        <h3
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="flex items-center gap-2 font-display text-ink text-title outline-none"
        >
          {result ? (
            <CircleCheck aria-hidden="true" size={20} strokeWidth={1.5} className="shrink-0 text-thread" />
          ) : null}
          {title ?? (result ? tf('doneTitle') : t('title'))}
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted text-small">
          <span>{sent === 1 ? t('stepsOne') : t('stepsMany', { n: sent })}</span>
          <span aria-hidden="true">·</span>
          <span>{t('signer')}</span>
          <Address address={plan.from} size="sm" copy={false} />
        </div>
      </header>

      {/* Done, the card becomes its Receipt: no progress, no warnings and no steps to review, each step said once. */}
      {view.total > 1 && !result ? <TxProgress rows={view.rows} testId={`${testId}-progress`} /> : null}

      {view.warnings.length > 0 && !result ? (
        <div className="flex flex-col gap-2">
          {view.warnings.map((w) => (
            <Banner key={warningKey(w)} tone="warn" testId={`warning-${w.code}`}>
              <WarningText warning={w} />
            </Banner>
          ))}
        </div>
      ) : null}

      {result ? null : (
        <ol aria-label={t('what')} className="flex flex-col">
          {view.rows.map((r, i) => (
            <StepItem
              key={r.index}
              row={r}
              last={i === view.rows.length - 1}
              explorer={runner.explorer}
              testId={testId}
              title={titles[r.index] ?? r.summary}
              // A warning before the step is sent; on a confirmed step a red label reads as an error.
              irreversible={
                r.phase !== 'confirmed' && stepIsIrreversible(plan.steps[r.index] ?? { action: r.action, data: '0x' })
              }
              mirror={stepMirror(r.index)}
            />
          ))}
        </ol>
      )}

      {bundleCalls && bundleCalls.length > 0 ? (
        <MirrorBox calls={bundleCalls} explorer={runner.explorer} testId={testId} bundle />
      ) : null}

      {view.blockedError ? <ErrorBox error={view.blockedError} testId={`${testId}-blocked-error`} /> : null}
      {/* While an outcome is unsettled, its banner says it all; the send's error would only repeat it in red. */}
      <ErrorBox
        error={unsettled ? null : runner.error}
        testId={`${testId}-error`}
        onRetry={runner.loadFailed ? runner.reload : undefined}
      />

      {/* Done, the Receipt's own border frames it; a rule above it would only draw a second line. */}
      <footer className={cn('flex flex-col gap-3', !result && 'border-line border-t pt-5')}>{action}</footer>

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
                onResult={(copied) => {
                  if (!copied) setCopyByHand(true);
                }}
              />
            </span>
            {copyByHand ? (
              <label className="flex w-full flex-col gap-1.5">
                <span className="text-ink-muted text-small">{t('handoffManual')}</span>
                <input
                  data-testid={`${testId}-link`}
                  readOnly
                  value={runner.handoffLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-xl border border-line-strong bg-surface-1 px-3 py-2 font-mono text-caption text-ink"
                />
              </label>
            ) : null}
          </div>
        </details>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  );
}
