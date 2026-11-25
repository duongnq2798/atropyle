'use client';

import type { P9Result, PropertyName, StateName } from '@atropyle/sdk';
import { BadgeCheck, Check, Minus, Play, RotateCcw, ShieldCheck, ShieldHalf, ShieldX, X } from 'lucide-react';
import * as m from 'motion/react-m';
import { useState } from 'react';
import { ENV, explorerUrlOf } from '@/config/env';
import { COMMANDS, NODE_MIN } from '@/content/commands';
import type { Lang, Params } from '@/i18n/core';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/count';
import { explorerBlock, explorerName } from '@/lib/links';
import { useWakeLock } from '@/lib/use-wake-lock';
import { messages as labels, STATE_KEY } from '@/messages/labels.messages';
import { messages } from '@/messages/proof.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import { DURATION, EASE_OUT_EXPO, sec } from '@/motion/tokens';
import { type GlyphName, StateGlyph } from '@/thread/glyphs';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { Button } from '@/ui/button';
import { CommandLine } from '@/ui/command-line';
import { CopyButton } from '@/ui/copy-button';
import { ExternalLink } from '@/ui/external-link';
import { UntrustedText } from '@/ui/untrusted-text';
import type { PolicyVerification } from '@/verify/types';
import { PROPERTY_ORDER } from '@/verify/verify-view';
import { certificateLines, P9_CASES } from './certificate';
import { Limits } from './limits';
import { CASES_PER_DOT, comboBitsOf, PROOF_BLOCKS, TOTAL_CASES } from './paint';
import { ProofCanvas } from './proof-canvas';
import { Seal } from './seal';
import type { ProofRun } from './use-proof-run';
import { useStagger } from './use-stagger';

type Key = keyof typeof messages.en;
type Translate = (key: Key, params?: Params) => string;

const BITS = comboBitsOf(PROOF_BLOCKS);

/** P1–P8 of the SDK, then P9 (result.p9), which PROPERTY_ORDER leaves out (7C main sync, ruling 2). */
export const PROOF_ROWS: readonly (PropertyName | 'P9')[] = [...PROPERTY_ORDER, 'P9'];

export type RowState = 'pending' | 'holds' | 'broken' | 'not-run';

const STATE_TEXT: Record<RowState, Key> = {
  pending: 'propPending',
  holds: 'propHolds',
  broken: 'propBroken',
  'not-run': 'propNotRun',
};

/** A row of a result. P9 follows the CLI (format.ts): ok holds, a mismatch fails, anything else did not run. */
export function rowState(r: PolicyVerification, row: PropertyName | 'P9'): Exclude<RowState, 'pending'> {
  if (row === 'P9') {
    if (r.p9 === null) return 'not-run';
    if (r.p9.ok) return 'holds';
    return r.p9.mismatches.length > 0 ? 'broken' : 'not-run';
  }
  if (r.combos === 0) return 'not-run';
  return r.properties[row].ok ? 'holds' : 'broken';
}

type VerdictKey = 'verdictOk' | 'verdictOkNoP9' | 'verdictPartial' | 'verdictBroken';

export function verdictOf(r: PolicyVerification): VerdictKey {
  if (!r.ok) return 'verdictBroken';
  if (r.combos !== TOTAL_CASES) return 'verdictPartial';
  return r.p9 ? 'verdictOk' : 'verdictOkNoP9';
}

function verdictText(t: Translate, r: PolicyVerification, lang: Lang): string {
  return t(verdictOf(r), {
    total: formatCount(TOTAL_CASES, lang),
    combos: formatCount(r.combos, lang),
    vectors: r.p9?.vectors ?? P9_CASES,
  });
}

/** The key of the map, in words: each glyph next to its colour (spec §4.3; the 7C-T2 report, notes for T3). */
const LEGEND: readonly { glyph: GlyphName; ink: string; swatch: string; state: StateName | null }[] = [
  { glyph: 'active', ink: 'text-alive', swatch: 'bg-alive', state: 'active' },
  { glyph: 'grace', ink: 'text-grace', swatch: 'bg-grace', state: 'grace' },
  { glyph: 'recovery', ink: 'text-recovery', swatch: 'bg-recovery', state: 'recovery' },
  { glyph: 'releasedInherit', ink: 'text-release', swatch: 'bg-release', state: 'releasedInherit' },
  { glyph: 'releasedRecover', ink: 'text-release', swatch: 'bg-release', state: 'releasedRecover' },
  { glyph: 'unused', ink: 'text-line-strong', swatch: 'bg-line-strong', state: null },
];

function Legend() {
  const t = useT(messages);
  const l = useT(labels);
  return (
    <div className="flex flex-col gap-2">
      <h3 id="proof-legend-title" className="text-ink-muted text-small">
        {t('legendTitle')}
      </h3>
      <ul aria-labelledby="proof-legend-title" className="grid gap-x-6 gap-y-2 text-small sm:grid-cols-2">
        {LEGEND.map((k) => (
          <li key={k.glyph} data-legend={k.glyph} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-[3px]', k.swatch)} />
            <StateGlyph name={k.glyph} className={cn('size-5 shrink-0', k.ink)} />
            <span>{k.state ? l(STATE_KEY[k.state]) : t('legendUnused')}</span>
          </li>
        ))}
        <li data-legend="pending" className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 shrink-0 rounded-[3px] border border-line-strong bg-surface-3" />
          <span aria-hidden="true" className="size-5 shrink-0" />
          <span>{t('legendPending')}</span>
        </li>
      </ul>
    </div>
  );
}

const PROGRESS =
  'h-1.5 w-full appearance-none overflow-hidden rounded-full bg-surface-3 [&::-moz-progress-bar]:bg-thread ' +
  '[&::-webkit-progress-bar]:bg-surface-3 [&::-webkit-progress-value]:bg-thread';

function liveText(run: ProofRun, t: Translate, lang: Lang): string {
  switch (run.status) {
    case 'loading':
      return t('liveLoading');
    case 'running': {
      // Words change only at each quarter, so a screen reader hears a handful of updates, not one per tick.
      const percent = Math.floor((run.doneBlocks * 4) / PROOF_BLOCKS) * 25;
      return percent > 0 ? t('livePercent', { percent }) : t('liveRunning');
    }
    case 'done':
      return run.result ? `${t('liveDone')} ${verdictText(t, run.result, lang)}` : t('liveDone');
    case 'error':
      return t('liveError');
    default:
      return '';
  }
}

function RunCard({ run, cases, wake }: { run: ProofRun; cases: number; wake: boolean }) {
  const t = useT(messages);
  const { lang } = useLang();
  const busy = run.status === 'loading' || run.status === 'running';
  return (
    <section
      data-testid="proof-run"
      data-status={run.status}
      data-wake={wake ? 'held' : 'off'}
      aria-labelledby="proof-run-title"
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface-1 p-5 sm:p-6 lg:col-start-2 lg:row-start-1"
    >
      <h2 id="proof-run-title" className="font-display text-title">
        {t('runTitle')}
      </h2>
      {/* The control right under the title, so it sits on the first screen at 390 px (R27); an error takes its place,
          with its own Retry. */}
      {run.status === 'error' ? (
        <ErrorBox error={run.error} onRetry={run.retry} />
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {run.status === 'done' ? (
            <>
              <Button
                data-testid="proof-again"
                variant="secondary"
                size="lg"
                icon={<RotateCcw aria-hidden="true" />}
                onClick={run.again}
                onPointerEnter={run.warm}
              >
                {t('again')}
              </Button>
              <p className="min-w-0 flex-1 basis-48 text-ink-muted text-small">{t('againHint')}</p>
            </>
          ) : (
            <Button
              data-testid="proof-start"
              variant="primary"
              size="lg"
              icon={<Play aria-hidden="true" />}
              loading={busy}
              loadingLabel={run.status === 'loading' ? t('loading') : t('running')}
              onClick={run.start}
              onPointerEnter={run.warm}
              onFocus={run.warm}
            >
              {run.status === 'loading' ? t('loading') : run.status === 'running' ? t('running') : t('start')}
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <progress aria-label={t('progressLabel')} max={PROOF_BLOCKS} value={run.doneBlocks} className={PROGRESS} />
        <p className={cn('text-small', run.status === 'idle' ? 'text-ink-muted' : 'font-mono tabular-nums')}>
          {run.status === 'idle'
            ? t('notStarted')
            : t('progress', { done: formatCount(cases, lang), total: formatCount(TOTAL_CASES, lang) })}
        </p>
      </div>
      <p data-testid="proof-live" aria-live="polite" className="sr-only">
        {liveText(run, t, lang)}
      </p>
      <p className="text-ink-muted text-small">{t('runBody')}</p>
      {/* Not a <noscript>: a browser that runs no script for this page but parses with scripting on (a script blocker,
          Playwright without JavaScript) shows nothing of one. The media feature follows what the page can run. */}
      <p className="hidden text-small [@media(scripting:none)]:block">{t('noScript')}</p>
    </section>
  );
}

function RowMark({ state, reduced }: { state: RowState; reduced: boolean }) {
  if (state === 'pending') {
    return <span aria-hidden="true" className="mt-1 size-5 shrink-0 rounded-full border border-line-strong" />;
  }
  const Icon = state === 'holds' ? Check : state === 'broken' ? X : Minus;
  const ink =
    state === 'holds'
      ? 'bg-alive text-bg'
      : state === 'broken'
        ? 'bg-danger text-on-danger'
        : 'bg-surface-3 text-ink-muted';
  return (
    <m.span
      key={state}
      aria-hidden="true"
      initial={reduced ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: sec(DURATION.base), ease: EASE_OUT_EXPO }}
      className={cn('mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full', ink)}
    >
      <Icon size={14} strokeWidth={2.5} />
    </m.span>
  );
}

function P9Detail({ p9 }: { p9: P9Result }) {
  const t = useT(messages);
  return (
    <ul className="flex flex-col gap-0.5 font-mono text-caption text-ink-muted tabular-nums">
      <li>{t('p9Seed', { seed: p9.seed.toString(10) })}</li>
      {p9.operators.map((op) => (
        <li key={op.operator}>
          {t('p9Operator', {
            n: op.operator,
            matched: op.matched,
            vectors: p9.vectors,
            block: op.blockNumber.toString(10),
            calls: op.calls,
            via: t(op.multicall ? 'p9Multicall' : 'p9OneByOne'),
          })}
        </li>
      ))}
    </ul>
  );
}

function Properties({
  result,
  lit,
  reduced,
}: {
  result: PolicyVerification | undefined;
  lit: number;
  reduced: boolean;
}) {
  const t = useT(messages);
  const { lang } = useLang();
  return (
    <section aria-labelledby="proof-props-title" className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
      <h2 id="proof-props-title" className="font-display text-title">
        {t('propsTitle')}
      </h2>
      <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-1">
        {PROOF_ROWS.map((row, i) => {
          const state: RowState = result && i < lit ? rowState(result, row) : 'pending';
          const violations = row !== 'P9' && result ? result.properties[row].violations : 0;
          return (
            <li key={row} data-testid={`proof-prop-${row}`} data-state={state} className="flex gap-3 px-4 py-3.5">
              <RowMark state={state} reduced={reduced} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-small">
                  <span className="mr-2 font-mono text-ink-muted tabular-nums">{row}</span>
                  {t(row, { vectors: P9_CASES })}
                </p>
                <p
                  className={cn(
                    'text-caption',
                    state === 'holds'
                      ? 'font-medium text-alive'
                      : state === 'broken'
                        ? 'font-medium text-danger'
                        : 'text-ink-muted',
                  )}
                >
                  {t(STATE_TEXT[state])}
                  {state === 'broken' && violations > 0
                    ? ` · ${t('propViolations', { n: formatCount(violations, lang) })}`
                    : ''}
                </p>
                {row === 'P9' && state !== 'pending' && result?.p9 ? <P9Detail p9={result.p9} /> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Certificate({ lines }: { lines: readonly string[] }) {
  const t = useT(messages);
  const text = lines.join('\n');
  return (
    <section
      data-testid="proof-certificate"
      aria-labelledby="proof-cert-title"
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-thread/40 bg-surface-1 p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 max-w-2xl flex-col gap-1.5">
          <h3 id="proof-cert-title" className="flex items-center gap-2 font-display text-title">
            <BadgeCheck aria-hidden="true" size={22} strokeWidth={1.75} className="shrink-0 text-thread" />
            {t('certTitle')}
          </h3>
          <p className="text-ink-muted text-small">{t('certBody')}</p>
        </div>
        <CopyButton text={text} label={t('certCopy')} showText />
      </div>
      {/* The thread on the left edge marks the eight lines as one document, the way the proof line marks every page. */}
      <pre
        translate="no"
        className="whitespace-pre-wrap rounded-r-xl border-thread/60 border-l-2 bg-surface-2 px-4 py-3.5 font-mono text-caption leading-relaxed wrap-anywhere sm:text-small"
      >
        {text}
      </pre>
    </section>
  );
}

const LINK =
  'rounded-sm text-thread underline decoration-thread/40 underline-offset-4 transition-colors duration-150 hover:decoration-thread';

/** The verdict's frame and badge: an icon and its words, never the colour alone (spec §4.3). */
const TONE = {
  passed: { Icon: ShieldCheck, border: 'border-alive/45', badge: 'bg-alive text-bg' },
  partial: { Icon: ShieldHalf, border: 'border-line-strong', badge: 'bg-surface-3 text-ink' },
  broken: { Icon: ShieldX, border: 'border-danger/60', badge: 'bg-danger text-on-danger' },
} as const;

function Verdict({ result }: { result: PolicyVerification }) {
  const t = useT(messages);
  const { lang } = useLang();
  const explorer = explorerUrlOf(ENV);
  const lines = certificateLines(result, lang);
  const notes = result.warnings.filter((w) => w.code !== 'SINGLE_RPC');
  const issues = [...new Set(result.issues)];
  const full = result.combos === TOTAL_CASES;
  const tone = TONE[!result.ok ? 'broken' : full ? 'passed' : 'partial'];
  return (
    <section
      data-testid="proof-verdict"
      data-ok={String(result.ok)}
      data-full={String(full)}
      aria-labelledby="proof-verdict-title"
      className="flex flex-col gap-6"
    >
      <div className={cn('flex min-w-0 flex-col gap-6 rounded-2xl border bg-surface-1 p-5 sm:p-8', tone.border)}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <span
            aria-hidden="true"
            className={cn('inline-flex size-12 shrink-0 items-center justify-center rounded-full', tone.badge)}
          >
            <tone.Icon size={26} strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <h2 id="proof-verdict-title" className="font-mono text-caption text-ink-muted uppercase tracking-[0.14em]">
              {t('verdictTitle')}
            </h2>
            <p className={cn('max-w-3xl font-display text-title sm:text-h2', result.ok ? 'text-ink' : 'text-danger')}>
              {verdictText(t, result, lang)}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-6 sm:pl-17">
          <dl className="grid gap-x-8 gap-y-2 text-small sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-ink-muted">{t('detailCases')}</dt>
            <dd className="font-mono tabular-nums">
              {t('casesIn', {
                combos: formatCount(result.combos, lang),
                seconds: formatCount(result.ms / 1000, lang, 1),
              })}
            </dd>
            <dt className="text-ink-muted">{t('detailBlock')}</dt>
            <dd>
              {explorer ? (
                <ExternalLink href={explorerBlock(explorer, result.blockNumber)} className={LINK}>
                  {t('blockOn', { block: result.blockNumber.toString(10), explorer: explorerName(explorer) })}
                </ExternalLink>
              ) : (
                <span className="font-mono tabular-nums">{result.blockNumber.toString(10)}</span>
              )}
            </dd>
            <dt className="text-ink-muted">{t('detailRpcs')}</dt>
            <dd>{result.rpcs >= 2 ? t('rpcsMany', { n: result.rpcs }) : t('rpcsOne')}</dd>
            <dt className="text-ink-muted">{t('detailCpu')}</dt>
            <dd className="min-w-0">
              <Address address={result.cpu} explorer={explorer} size="sm" />
            </dd>
            <dt className="text-ink-muted">{t('detailBeacon')}</dt>
            <dd>{result.beaconFrozen === null ? t('unknown') : result.beaconFrozen ? t('yes') : t('no')}</dd>
          </dl>
          {issues.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-display text-title">{t('issuesTitle')}</h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-small">
                {issues.map((s) => (
                  <li key={s}>
                    <UntrustedText value={s} max={240} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {notes.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-display text-title">{t('warningsTitle')}</h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-small">
                {notes.map((w) => (
                  <li key={w.code}>
                    <UntrustedText value={w.message} max={240} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <a href="#limits" className={cn(LINK, 'self-start text-small')}>
            {t('limitsLink')}
          </a>
        </div>
      </div>
      {lines ? <Certificate lines={lines} /> : null}
    </section>
  );
}

function Terminal() {
  const t = useT(messages);
  return (
    <section data-testid="proof-cli" aria-labelledby="proof-cli-title" className="flex max-w-3xl flex-col gap-3">
      <h2 id="proof-cli-title" className="font-display text-title">
        {t('cliTitle')}
      </h2>
      <p className="text-ink-muted">{t('cliBody', { node: NODE_MIN })}</p>
      <CommandLine command={COMMANDS.verify} label={t('copyCli')} />
    </section>
  );
}

/**
 * /proof/ (spec §4.6.1, §18.4.3 Task 3). The whole layout is on the first paint (§18 principle 6), never in italic
 * (R18.10). Voices: Proclaim is font-display; Ledger is font-mono with tabular figures (7B's voice utilities are not on
 * this branch). The run card comes first in the DOM (the control before what it fills); from lg the map holds the
 * left column, sticky, beside the card and the rows. A finished run lights P1 to P9 one by one, unless the page had the
 * result when it mounted or the reader prefers reduced motion. The screen stays on while the proof reads and runs.
 */
export function ProofView({ run }: { run: ProofRun }) {
  const t = useT(messages);
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const [doneAtMount] = useState(() => run.status === 'done');
  const result = run.status === 'done' ? run.result : undefined;
  const lit = useStagger(PROOF_ROWS.length, result !== undefined, reduced || (doneAtMount && run.runs === 0));
  const wake = useWakeLock(run.status === 'loading' || run.status === 'running');
  const total = formatCount(TOTAL_CASES, lang);
  const cases = Math.min(run.doneBlocks * 32, TOTAL_CASES);
  return (
    <article className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-12 sm:gap-20 sm:px-6 sm:py-16">
      <header className="flex max-w-3xl flex-col gap-4">
        <p className="font-mono text-caption text-thread uppercase tracking-[0.14em]">{t('eyebrow')}</p>
        <h1 className="font-display text-h1">{t('title')}</h1>
        <p className="text-ink-muted text-lead">{t('lead', { total, vectors: P9_CASES })}</p>
      </header>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-x-12">
        <RunCard run={run} cases={cases} wake={wake} />
        <section
          aria-labelledby="proof-map-title"
          className="flex flex-col gap-4 lg:sticky lg:top-20 lg:col-start-1 lg:row-span-2 lg:row-start-1"
        >
          <h2 id="proof-map-title" className="font-display text-title">
            {t('mapTitle')}
          </h2>
          <ProofCanvas
            comboBits={BITS}
            doneBlocks={run.doneBlocks}
            label={t('mapLabel', { done: formatCount(cases, lang), total, perDot: CASES_PER_DOT })}
          />
          <p className="text-ink-muted text-small">{t('mapCaption', { perDot: CASES_PER_DOT })}</p>
          <Legend />
        </section>
        <Properties result={result} lit={lit} reduced={reduced} />
      </div>
      <Seal result={result} />
      {result ? <Verdict result={result} /> : null}
      <Terminal />
      <Limits />
    </article>
  );
}
