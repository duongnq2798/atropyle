'use client';

import { ArrowRight, Check, ChevronDown, type LucideIcon, Minus, X } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import type { Address as Addr } from 'viem';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/count';
import { explorerName } from '@/lib/links';
import { messages } from '@/messages/verify-page.messages';
import { ROUTES, vaultHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { buttonClass } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { ExternalLink } from '@/ui/external-link';
import { Skeleton } from '@/ui/skeleton';
import { Spinner } from '@/ui/spinner';
import { UntrustedText } from '@/ui/untrusted-text';
import { VisuallyHidden } from '@/ui/visually-hidden';
import type { PolicyVerification, ProofProgress, VaultVerification } from '@/verify/types';
import {
  PROPERTY_ORDER,
  proofSummary,
  type RowId,
  type RowState,
  type VerifyRow,
  vaultVerifyRows,
} from '@/verify/verify-view';
import {
  commandWords,
  LINE_IDS,
  type LineId,
  type LineState,
  lineLink,
  type Overall,
  overallOf,
  p9SeedOf,
  verifyCommand,
  verifyLines,
} from './lines';

/** What the page knows of its own build (read at build time by page.tsx): no SDK code ships for it. */
export interface VerifySite {
  /** The SDK release this site was built with; the command pins it. */
  version: string;
  explorer: string | null;
  /** The processor of this build's deployment, where the vault rules run. */
  cpu: Addr;
  /** RPC operator groups the deployment lists: more than one means a single answer was this site's choice. */
  quorumGroups: number;
}

export const VERIFY_SHELL = 'mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14';

/** Shown at most, so a broken deployment cannot fill the page with SDK messages. */
const MAX_ISSUES = 4;

const LINE_KEY = {
  real: ['lineReal', 'lineRealHelp'],
  rules: ['lineRules', 'lineRulesHelp'],
  operators: ['lineOperators', 'lineOperatorsHelp'],
} as const satisfies Record<LineId, readonly [string, string]>;

const STATE_KEY = {
  pass: 'statePass',
  fail: 'stateFail',
  unknown: 'stateUnknown',
  checking: 'stateChecking',
} as const satisfies Record<LineState, string>;

const ROW_KEY = {
  factory: 'rowfactory',
  proxy: 'rowproxy',
  binding: 'rowbinding',
  code: 'rowcode',
  policy: 'rowpolicy',
  operators: 'rowoperators',
} as const satisfies Record<RowId, string>;

const ROW_TONE = { pass: 'text-alive', fail: 'text-danger', unknown: 'text-ink-muted' } as const satisfies Record<
  RowState,
  string
>;

/** "Not checked" must never look like a failure: grey and a dash, not red and a cross. */
const MARK: Record<RowState, { box: string; Icon: LucideIcon }> = {
  pass: { box: 'bg-alive text-bg', Icon: Check },
  fail: { box: 'bg-danger text-on-danger', Icon: X },
  unknown: { box: 'bg-surface-3 text-ink-muted', Icon: Minus },
};

const CHIP = {
  pass: 'bg-alive/15 text-ink',
  fail: 'bg-danger/15 text-ink',
  unknown: 'bg-surface-2 text-ink-muted',
  checking: 'bg-surface-2 text-ink',
} as const satisfies Record<LineState, string>;

/** The page's one answer: its wash, its disc and its words. Pending has no disc colour: it says nothing yet. */
const OVERALL = {
  pending: { box: 'border-line bg-surface-1', disc: null, title: 'checkingPolicy', body: 'checkingHelp' },
  pass: {
    box: 'border-alive/45 bg-alive/8',
    disc: { box: 'bg-alive text-bg', Icon: Check },
    title: 'overallOk',
    body: 'overallOkHelp',
  },
  fail: {
    box: 'border-danger/45 bg-danger/8',
    disc: { box: 'bg-danger text-on-danger', Icon: X },
    title: 'overallFail',
    body: 'overallFailHelp',
  },
  partial: {
    box: 'border-grace/45 bg-grace/8',
    disc: { box: 'bg-grace text-bg', Icon: Minus },
    title: 'overallNo',
    body: 'overallNoHelp',
  },
} as const satisfies Record<
  Overall,
  { box: string; disc: { box: string; Icon: LucideIcon } | null; title: string; body: string }
>;

type CodeState = 'true' | 'false' | 'none';
const CODE_KEY = { true: 'codePinned', false: 'codeDiffers', none: 'codeNoPin' } as const satisfies Record<
  CodeState,
  string
>;

function codeState(matches: boolean | null): CodeState {
  return matches === null ? 'none' : matches ? 'true' : 'false';
}

const LINK = 'underline decoration-line-strong decoration-1 underline-offset-4 hover:decoration-thread';

/** Why the answer can be trusted. Before there is an answer it leads; under the answer it explains, at body size. */
function VerifyIntro({ lead }: { lead: boolean }) {
  const t = useT(messages);
  return (
    <p data-testid="verify-intro" className={cn('max-w-[62ch] text-ink-muted', lead ? 'text-lead' : 'text-body')}>
      {t('intro')}
    </p>
  );
}

/**
 * The page's frame: the question and the vault it is asked about. `answered`: the children are a report, which puts
 * its answer right under the address and the intro after it; otherwise the intro closes the header.
 */
export function VerifyShell({
  vault,
  explorer,
  answered = false,
  children,
}: {
  vault: Addr | null;
  explorer: string | null;
  answered?: boolean;
  children: ReactNode;
}) {
  const t = useT(messages);
  return (
    <div data-testid="verify" className={VERIFY_SHELL}>
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-h1 text-ink">{t('title')}</h1>
        {vault ? (
          <Address address={vault} explorer={explorer} copy className="self-start" />
        ) : (
          <Skeleton className="h-9 w-72 max-w-full [@media(scripting:none)]:hidden" />
        )}
        {answered ? null : <VerifyIntro lead />}
      </header>
      {children}
    </div>
  );
}

/** The shape of what comes: the answer, then the three lines. Hidden without JavaScript, where it would never fill. */
export function VerifyLoadingBody() {
  const t = useT(messages);
  return (
    <div data-testid="verify-loading" aria-busy="true" className="flex flex-col gap-3 [@media(scripting:none)]:hidden">
      <p className="sr-only">{t('loading')}</p>
      <Skeleton className="h-20 w-full rounded-2xl" />
      {LINE_IDS.map((id) => (
        <Skeleton key={id} className="h-36 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function StateMark({ state }: { state: LineState }) {
  if (state === 'checking') {
    return (
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full border border-line-strong text-thread"
      >
        <Spinner size={20} />
      </span>
    );
  }
  const { box, Icon } = MARK[state];
  return (
    <span aria-hidden="true" className={cn('grid size-10 shrink-0 place-items-center rounded-full', box)}>
      <Icon size={20} strokeWidth={2.25} />
    </span>
  );
}

function ProofProgressBar({ progress }: { progress: ProofProgress }) {
  const t = useT(messages);
  const pct = progress.total > 0 ? Math.floor((progress.done / progress.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <progress
        data-testid="verify-progress"
        aria-label={t('progressLabel')}
        max={progress.total}
        value={progress.done}
        className="h-1.5 w-full appearance-none overflow-hidden rounded-full bg-surface-3 [&::-moz-progress-bar]:bg-thread [&::-webkit-progress-bar]:bg-surface-3 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-thread"
      />
      <p className="voice-ledger text-caption text-ink-muted">{t('progress', { pct })}</p>
    </div>
  );
}

/** Why the providers line is not checked: a choice of this site (deweb without cross-check), or of the deployment. */
function OperatorsHint({ quorumGroups }: { quorumGroups: number }) {
  const t = useT(messages);
  return (
    <p data-testid="verify-line-operators-hint" className="text-ink text-small">
      {quorumGroups > 1 ? (
        <>
          {t('operatorsSingle')}{' '}
          <NavLink href={ROUTES.status} prefetch={false} className={LINK}>
            {t('operatorsStatus')}
          </NavLink>
        </>
      ) : (
        t('operatorsOnly')
      )}
    </p>
  );
}

function LineCard({
  id,
  state,
  href,
  explorer,
  children,
}: {
  id: LineId;
  state: LineState;
  href: string | null;
  explorer: string | null;
  children?: ReactNode;
}) {
  const t = useT(messages);
  const [title, help] = LINE_KEY[id];
  return (
    <li
      data-testid={`verify-line-${id}`}
      data-state={state}
      className={cn(
        'flex gap-4 rounded-2xl border bg-surface-1 p-5 sm:gap-5 sm:p-6',
        state === 'fail' ? 'border-danger/45' : 'border-line',
      )}
    >
      <StateMark state={state} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* On a phone the chip follows the last word of the title, so it never sits alone on a line of its own: an
            inline chip with no space before it binds to that word (an inline-block left a break before it, and
            "Đang kiểm…" fell to a line of its own at 320 px, 7B-P1). */}
        {/* On a phone the wrapper is the block whose lines hold both, so it is the one that balances them. */}
        <div className="[text-wrap:balance] sm:flex sm:items-center sm:justify-between sm:gap-3 sm:[text-wrap:wrap]">
          <h2 className="inline font-display text-ink text-title sm:block">{t(title)}</h2>
          <span
            className={cn(
              'ml-2 inline whitespace-nowrap rounded-full px-2.5 py-0.5 align-middle font-medium text-caption sm:ml-0 sm:shrink-0',
              CHIP[state],
            )}
          >
            {t(STATE_KEY[state])}
          </span>
        </div>
        <p className="text-ink-muted text-small">{t(help)}</p>
        {children}
        {href && explorer ? (
          <span data-testid={`verify-line-${id}-link`} className="text-small">
            {/* flow: at 320 px the label wraps, and its arrow stays with "OKLink" (7B-P1). */}
            <ExternalLink href={href} variant="flow">
              {t('checkOn', { name: explorerName(explorer) })}
            </ExternalLink>
          </span>
        ) : null}
      </div>
    </li>
  );
}

function NextCard({ vault }: { vault: Addr }) {
  const t = useT(messages);
  return (
    <NavLink
      href={vaultHref(vault)}
      data-testid="verify-next"
      className="group flex items-center justify-between gap-4 rounded-2xl border border-alive/45 bg-alive/8 p-5 text-ink text-lead transition-colors duration-150 hover:border-thread sm:p-6"
    >
      <span data-testid="verify-next-label" className="min-w-0 [text-wrap:balance]">
        {t('next')}
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-5 shrink-0 motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-1"
      />
    </NavLink>
  );
}

function RuleChip({ name, ok }: { name: string; ok: boolean }) {
  const t = useT(messages);
  const Icon = ok ? Check : X;
  return (
    <li
      data-testid={`verify-proof-${name}`}
      data-ok={String(ok)}
      className={cn(
        'voice-ledger inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption text-ink',
        ok ? 'bg-alive/15' : 'bg-danger/15',
      )}
    >
      <Icon aria-hidden="true" size={12} strokeWidth={2.5} />
      {name}
      <VisuallyHidden> {t(ok ? 'statePass' : 'stateFail')}</VisuallyHidden>
    </li>
  );
}

/** The policy proof, in the reader's words: the rules, the processor's own answers (P9), the code it runs. */
function ProofBlock({ result }: { result: PolicyVerification }) {
  const t = useT(messages);
  const { lang } = useLang();
  const s = proofSummary(result);
  const rulesHold = s.properties.every((p) => p.ok);
  const p9 = result.p9;
  const code = result.cpuCheck ? codeState(result.cpuCheck.code.matches) : null;
  return (
    <section
      aria-labelledby="verify-proof-title"
      data-testid="verify-proof"
      data-ok={String(s.ok)}
      className="flex flex-col gap-4 rounded-2xl border border-line p-5 sm:p-6"
    >
      <h2 id="verify-proof-title" className="font-display text-ink text-title">
        {t('proofTitle')}
      </h2>
      <p className="text-body text-ink">
        {rulesHold
          ? t('proofRules', {
              rules: PROPERTY_ORDER.length,
              n: formatCount(s.combos, lang),
              s: formatCount(s.seconds, lang, 1),
              block: formatCount(s.blockNumber, lang),
            })
          : t('proofBad')}
      </p>
      <ul aria-label={t('rulesLabel')} className="flex flex-wrap gap-2">
        {s.properties.map((p) => (
          <RuleChip key={p.name} name={p.name} ok={p.ok} />
        ))}
        {p9 ? <RuleChip name="P9" ok={p9.ok} /> : null}
      </ul>
      {p9 ? (
        <p data-testid="verify-proof-p9" data-ok={String(p9.ok)} className="text-ink-muted text-small">
          {!p9.ok
            ? t('p9Bad')
            : p9.operators.length === 1
              ? t('p9OkOne', { vectors: formatCount(p9.vectors, lang) })
              : t('p9Ok', {
                  vectors: formatCount(p9.vectors, lang),
                  operators: formatCount(p9.operators.length, lang),
                })}
        </p>
      ) : null}
      {code ? (
        <p data-testid="verify-proof-code" data-ok={code} className="text-ink-muted text-small">
          {t(CODE_KEY[code])}
        </p>
      ) : null}
      {!s.ok && s.issues.length > 0 ? (
        <ul data-testid="verify-proof-issues" className="voice-ledger flex flex-col gap-1 text-caption text-ink-muted">
          {s.issues.slice(0, MAX_ISSUES).map((issue) => (
            <li key={issue}>
              <UntrustedText value={issue} max={200} />
            </li>
          ))}
        </ul>
      ) : null}
      <NavLink
        href={ROUTES.proof}
        prefetch={false}
        className={cn('group inline-flex items-center gap-1.5 self-start text-ink text-small', LINK)}
      >
        {t('proofLink')}
        <ArrowRight
          aria-hidden="true"
          className="size-4 shrink-0 motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-0.5"
        />
      </NavLink>
    </section>
  );
}

/** The two halves of a failing row's detail ("expected → actual", src/verify/verify-view.ts), or the detail whole. */
const DETAIL_ARROW = ' → ';

/**
 * A failing row's detail, in the Ledger voice. 7A rule 20: the self-hosted fonts have no U+2192, so the arrow that
 * verify-view.ts puts between expected and actual is drawn as an icon, with "to" for screen readers.
 */
function RowDetail({ detail }: { detail: string }) {
  const t = useT(messages);
  const parts = detail.split(DETAIL_ARROW);
  return (
    <span className="voice-ledger break-all text-caption text-ink-muted">
      {parts.length === 2 ? (
        <>
          <UntrustedText value={parts[0]} max={80} />
          <ArrowRight aria-hidden="true" className="mx-1 inline size-3 align-[-0.125em]" />
          <VisuallyHidden> {t('detailTo')} </VisuallyHidden>
          <UntrustedText value={parts[1]} max={80} />
        </>
      ) : (
        <UntrustedText value={detail} max={160} />
      )}
    </span>
  );
}

function TechnicalChecks({ rows }: { rows: readonly VerifyRow[] }) {
  const t = useT(messages);
  return (
    <details data-testid="verify-details" className="group rounded-2xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-5 text-body text-ink sm:px-6 [&::-webkit-details-marker]:hidden">
        {t('details')}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-muted group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-150"
        />
      </summary>
      <ul className="flex flex-col divide-y divide-line px-5 pb-3 sm:px-6">
        {rows.map((r) => (
          <li key={r.id} data-testid={`verify-row-${r.id}`} data-state={r.state} className="flex flex-col gap-1 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink text-small">{t(ROW_KEY[r.id])}</span>
              <span className={cn('shrink-0 font-medium text-small', ROW_TONE[r.state])}>{t(STATE_KEY[r.state])}</span>
            </div>
            {r.detail ? <RowDetail detail={r.detail} /> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

const SEED_FLAG = '--p9-seed';

/** A sentence that names the seed flag: the flag is set as code and never breaks at its hyphens. */
function WithFlag({ text }: { text: string }) {
  const i = text.indexOf(SEED_FLAG);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <code className="voice-ledger whitespace-nowrap text-ink">{SEED_FLAG}</code>
      {text.slice(i + SEED_FLAG.length)}
    </>
  );
}

function CommandBox({ command, seeded }: { command: string; seeded: boolean }) {
  const t = useT(messages);
  return (
    <section aria-labelledby="verify-cli-title" className="flex flex-col gap-3">
      <h2 id="verify-cli-title" className="font-display text-ink text-title">
        {t('cliTitle')}
      </h2>
      <p className="text-ink-muted text-small">
        {t('cliHelp')}
        {seeded ? (
          <>
            {' '}
            <WithFlag text={t('cliSeed')} />
          </>
        ) : null}
      </p>
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
        <code data-testid="verify-cli" className="voice-ledger min-w-0 flex-1 text-ink text-small leading-relaxed">
          {commandWords(command).map((w, i) => (
            <Fragment key={w.text}>
              {i > 0 ? ' ' : null}
              <span className={w.long ? '[overflow-wrap:anywhere]' : 'whitespace-nowrap'}>{w.text}</span>
            </Fragment>
          ))}
        </code>
        <CopyButton text={command} label={t('copyCommand')} />
      </div>
    </section>
  );
}

export interface VerifyReportProps {
  vault: Addr;
  site: VerifySite;
  verification: VaultVerification;
  /** The policy proof still runs in the worker: the rules line reads "checking". */
  proofRunning: boolean;
  progress: ProofProgress | null;
  /** The proof run itself failed (a read or the worker), with its Retry. */
  proofError: { error: unknown; retry(): void } | null;
}

/**
 * The page's one answer, in its loudest voice after the question. Until there is an answer it stays at title size,
 * with a spinner: it does not shout "checking".
 */
function Verdict({ overall }: { overall: Overall }) {
  const t = useT(messages);
  const o = OVERALL[overall];
  return (
    <div
      role={overall === 'fail' ? 'alert' : undefined}
      className={cn('flex flex-col items-start gap-3 rounded-2xl border p-5 sm:flex-row sm:gap-5 sm:p-6', o.box)}
    >
      {o.disc ? (
        <span
          aria-hidden="true"
          className={cn('grid size-10 shrink-0 place-items-center rounded-full sm:size-12', o.disc.box)}
        >
          <o.disc.Icon size={24} strokeWidth={2.25} className="size-5 sm:size-6" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-line-strong text-thread sm:size-12"
        >
          <Spinner size={22} className="[&>svg]:size-[18px] sm:[&>svg]:size-[22px]" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p
          data-testid="verify-verdict-title"
          className={cn('font-display text-ink [text-wrap:balance]', o.disc ? 'text-h2' : 'text-title')}
        >
          {t(o.title)}
        </p>
        <p className="text-body text-ink-muted">{t(o.body)}</p>
      </div>
    </div>
  );
}

/**
 * The answer, the intro, the three lines, the proof, the technical rows and the command; no data hook (the e2e page
 * feeds it). Its shell is `answered`, so the intro is said once, after the answer.
 */
export function VerifyReport({ vault, site, verification: v, proofRunning, progress, proofError }: VerifyReportProps) {
  const t = useT(messages);
  const { lang } = useLang();
  const rows = vaultVerifyRows(v);
  const overall = overallOf(rows, proofRunning);
  const o = OVERALL[overall];
  const explorer = site.explorer;
  const seed = p9SeedOf(v);
  const command = verifyCommand(site.version, vault, seed);
  return (
    <>
      <div
        data-testid="verify-overall"
        data-ok={overall === 'pending' ? 'pending' : String(overall === 'pass')}
        data-overall={overall}
      >
        <Verdict overall={overall} />
      </div>
      <VerifyIntro lead={false} />
      {/* A failure interrupts (the verdict's role="alert"); the other final answers are read once they land. */}
      <p data-testid="verify-live" aria-live="polite" className="sr-only">
        {overall === 'pass' || overall === 'partial' ? t(o.title) : ''}
      </p>
      <ol className="flex flex-col gap-3">
        {verifyLines(rows, proofRunning).map((line) => (
          <LineCard
            key={line.id}
            id={line.id}
            state={line.state}
            explorer={explorer}
            href={explorer ? lineLink(line.id, { explorer, vault, cpu: site.cpu, block: v.blockNumber }) : null}
          >
            {line.id === 'rules' && proofRunning && progress ? <ProofProgressBar progress={progress} /> : null}
            {/* Why the rules are not checked sits on their line, in its words: not a red box under a line that says
                Not checked is no failure. */}
            {line.id === 'rules' && v.policy.status === 'unavailable' ? (
              <ErrorBox error={v.policy.error} bare="message" className="text-ink text-small" />
            ) : null}
            {line.id === 'operators' && line.state === 'unknown' && v.rpcs < 2 ? (
              <OperatorsHint quorumGroups={site.quorumGroups} />
            ) : null}
          </LineCard>
        ))}
      </ol>
      <p className="text-caption text-ink-muted">{t('atBlock', { block: formatCount(v.blockNumber, lang) })}</p>
      {overall === 'pass' ? <NextCard vault={vault} /> : null}
      {proofError ? <ErrorBox error={proofError.error} onRetry={proofError.retry} testId="verify-proof-error" /> : null}
      {v.policy.status === 'verified' ? <ProofBlock result={v.policy.result} /> : null}
      <TechnicalChecks rows={rows} />
      <CommandBox command={command} seeded={seed !== null} />
      {overall === 'pending' || overall === 'partial' ? (
        <NavLink
          href={vaultHref(vault)}
          data-testid="verify-open-vault"
          className={buttonClass({ variant: 'secondary', className: 'self-start' })}
        >
          {t('openVault')}
        </NavLink>
      ) : null}
    </>
  );
}
