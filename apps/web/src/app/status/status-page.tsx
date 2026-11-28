'use client';

import type { IntegrityReport } from '@atropyle/sdk';
import type { UseQueryResult } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useHealth } from '@/api/hooks';
import { CHAIN_ID } from '@/chain/hooks';
import { useChainSettings } from '@/chain/provider';
import { useSdk } from '@/chain/use-sdk';
import { type StatsState, useStats } from '@/chain/use-stats';
import { ENV, IS_VERCEL } from '@/config/env';
import { Stamp } from '@/home/scene';
import type { Params } from '@/i18n/core';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/count';
import { chainDate } from '@/lib/when';
import { messages as status } from '@/messages/status.messages';
import { ErrorBox } from '@/tx/error-box';
import { uniqueWarnings, warningKey } from '@/tx/tx-view';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { Skeleton } from '@/ui/skeleton';
import { Spinner } from '@/ui/spinner';
import { UntrustedText } from '@/ui/untrusted-text';
import { networkName } from '@/wallet/network';
import { useWallet } from '@/wallet/provider';
import { checkKey, expectedCheckCount } from './checks';
import { type CounterId, counterTiles, coverageOf, tileText } from './counters-view';
import { backendTone, contractsTone, formatAge, type HealthRow, type HealthTone, healthRows } from './health';
import type { RpcProbe } from './impl/diagnostics';
import { STATUS_MAX_VAULTS, useCounters, useDiagnosticsImpl, useIntegrity, useProbes } from './queries';
import { rpcUrlsOf } from './rpc-urls';

type Tone = HealthTone | 'off';
type GlanceId = 'contracts' | 'nodes' | 'backend';

const TONE_KEY = { ok: 'toneOk', warn: 'toneWarn', bad: 'toneBad', unknown: 'toneUnknown', off: 'toneOff' } as const;
const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-alive',
  warn: 'text-grace',
  bad: 'text-danger',
  unknown: 'text-ink-muted',
  off: 'text-ink-muted',
};
const GLANCE_KEY = { contracts: 'glanceContracts', nodes: 'glanceNodes', backend: 'glanceBackend' } as const;
const HEALTH_TITLE = { indexer: 'healthIndexer', integrity: 'healthIntegrity', keeper: 'healthKeeper' } as const;
const TILE_KEY = {
  vaults: 'ctVaults',
  drills: 'ctDrills',
  paid: 'ctPaid',
  releases: 'ctReleases',
  stablecoins: 'ctStablecoins',
} as const;
const DEFS = [
  ['vaults', 'defVaults'],
  ['drills', 'defDrills'],
  ['paid', 'defPaid'],
  ['releases', 'defReleases'],
  ['stablecoins', 'defStablecoins'],
] as const;

function Section({
  id,
  title,
  lead,
  testId,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className="flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-surface-1 p-5 md:p-6"
    >
      <h2 id={id} className="voice-proclaim text-title">
        {title}
      </h2>
      {lead ? <p className="text-pretty text-ink-muted text-small">{lead}</p> : null}
      {children}
    </section>
  );
}

/** Three exact counts over two columns each, then the two that may be lower bounds over three (a six-column grid). */
const TILE_SPAN: Record<CounterId, string> = {
  vaults: 'md:col-span-2',
  drills: 'md:col-span-2',
  paid: 'md:col-span-2',
  releases: 'md:col-span-3',
  stablecoins: 'col-span-2 md:col-span-3',
};
const TILE_ORDER: readonly CounterId[] = ['vaults', 'drills', 'paid', 'releases', 'stablecoins'];

function Counters({ round }: { round: number }) {
  const t = useT(status);
  const { lang } = useLang();
  const q = useCounters(round);
  const c = q.data;
  const cov = c ? coverageOf(c, STATUS_MAX_VAULTS) : null;
  return (
    <Section id="status-counters" testId="counters" title={t('countersTitle')}>
      {q.isError && !c ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : null}
      {!c && !q.isError ? <span className="sr-only">{t('countersLoading')}</span> : null}
      {/* A read that failed before it had numbers shows its error alone: placeholders would say it is still reading. */}
      {q.isError && !c ? null : (
        <ul aria-busy={!c} className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {c
            ? counterTiles(c).map((x) => {
                const all = tileText(x, x.all, lang);
                return (
                  <li
                    key={x.id}
                    data-testid={`counter-${x.id}`}
                    data-all={x.all.toString()}
                    data-outside={x.outsideTeam.toString()}
                    data-lower-bound={String(x.lowerBound)}
                    className={cn(
                      'flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-line bg-surface-2 p-4 md:p-5',
                      TILE_SPAN[x.id],
                    )}
                  >
                    <span className="text-ink-muted text-small">{t(TILE_KEY[x.id])}</span>
                    <span className="flex flex-col gap-1">
                      {/* A lower bound reads "n or more" on screen and to a screen reader, as one phrase. */}
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span
                          aria-hidden={x.lowerBound || undefined}
                          className="voice-ledger text-h2 text-ink tabular-nums leading-none wrap-anywhere"
                        >
                          {all}
                        </span>
                        {x.lowerBound ? (
                          <>
                            <span aria-hidden="true" className="text-ink-muted text-small">
                              {t('orMore')}
                            </span>
                            <span className="sr-only">{t('atLeast', { n: all })}</span>
                          </>
                        ) : null}
                      </span>
                      <span className="voice-ledger text-caption text-ink-muted">
                        {t('outside', { n: tileText(x, x.outsideTeam, lang) })}
                      </span>
                    </span>
                  </li>
                );
              })
            : TILE_ORDER.map((id) => (
                <li
                  key={id}
                  className={cn(
                    'flex h-32 flex-col justify-between rounded-2xl border border-line bg-surface-2 p-4 md:p-5',
                    TILE_SPAN[id],
                  )}
                >
                  <Skeleton className="h-4 w-2/3" />
                  <span className="flex flex-col gap-2">
                    <Skeleton className="h-8 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </span>
                </li>
              ))}
        </ul>
      )}
      {c ? (
        <p data-testid="counters-asof" className="voice-ledger text-caption text-ink-muted">
          {t('asOf', { block: formatCount(c.blockNumber, lang), time: chainDate(c.blockTimestamp, lang, true) })}
        </p>
      ) : null}
      {c && cov !== 'complete' ? (
        // A footnote to the "or more" tiles, not a headline: muted, with a small glyph in the grace tone.
        <p
          data-testid="counters-partial"
          data-cap={String(cov === 'cap')}
          className="flex items-start gap-2 text-pretty text-ink-muted text-small"
        >
          <Info aria-hidden="true" focusable="false" className="mt-[0.2em] size-4 shrink-0 text-grace" />
          <span>
            {t(cov === 'cap' ? 'partialCap' : 'partial', {
              read: formatCount(c.read, lang),
              all: formatCount(c.vaults.all, lang),
              max: formatCount(STATUS_MAX_VAULTS, lang),
            })}
          </span>
        </p>
      ) : null}
      {c && !c.teamComplete ? (
        <p data-testid="counters-team-partial" className="text-pretty text-small">
          {t('teamPartial')}
        </p>
      ) : null}
      <div data-testid="counters-defs" className="flex flex-col gap-3 border-line border-t pt-5">
        <h3 className="font-medium">{t('defTitle')}</h3>
        <dl className="grid gap-x-6 gap-y-3 text-pretty text-small md:grid-cols-[11rem_minmax(0,1fr)]">
          {DEFS.map(([id, k]) => (
            <div key={k} className="contents">
              <dt className="font-medium text-ink">{t(TILE_KEY[id])}</dt>
              <dd className="-mt-2 text-ink-muted md:mt-0">{t(k)}</dd>
            </div>
          ))}
          {c ? (
            <div className="contents">
              <dt className="font-medium text-ink">{t('defTeamTerm')}</dt>
              <dd className="-mt-2 text-ink-muted md:mt-0">
                {c.team.length === 0 ? t('defTeamNone') : t('defTeam', { n: c.team.length })}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </Section>
  );
}

function EventCount({ stats }: { stats: StatsState }) {
  const t = useT(status);
  const { lang } = useLang();
  const s = stats.summary;
  return (
    <Section id="status-stats" testId="stats" title={t('statsTitle')} lead={t('statsLead')}>
      {s ? (
        <>
          <ul className="grid grid-cols-3 gap-3">
            {(
              [
                ['vaults', 'statVaults', s.vaults],
                ['drills', 'statDrills', s.drills],
                ['checkIns', 'statCheckIns', s.checkIns],
              ] as const
            ).map(([id, key, n]) => (
              <li key={id} data-testid={`stat-${id}`} data-value={String(n)} className="flex min-w-0 flex-col gap-1">
                <span className="text-ink-muted text-small">{t(key)}</span>
                <span className="voice-ledger text-title tabular-nums">{formatCount(n, lang)}</span>
              </li>
            ))}
          </ul>
          <p className="voice-ledger text-caption text-ink-muted">
            {t(s.source === 'api' ? 'statsFromApi' : 'statsFromDevice', { block: formatCount(s.block, lang) })}
          </p>
        </>
      ) : stats.loading ? (
        <Spinner label={t('loading')} />
      ) : (
        <p data-testid="stats-none" className="text-ink-muted">
          {t('statsNone')}
        </p>
      )}
      {stats.progress ? (
        <p data-testid="stats-progress" role="status" className="voice-ledger text-small">
          {t('statsProgress', {
            done: formatCount(stats.progress.done, lang),
            total: formatCount(stats.progress.total, lang),
          })}
        </p>
      ) : null}
      {stats.error ? <ErrorBox error={stats.error} onRetry={stats.refresh} /> : null}
      <Button data-testid="stats-load" className="self-start" loading={stats.busy} onClick={stats.refresh}>
        {s?.source === 'chain' ? t('statsAgain') : t('statsRun')}
      </Button>
    </Section>
  );
}

function Glance({ items }: { items: readonly { id: GlanceId; tone: Tone | null }[] }) {
  const t = useT(status);
  return (
    <ul aria-label={t('glanceLabel')} className="flex flex-wrap gap-2 pt-1">
      {items.map((g) => (
        <li
          key={g.id}
          data-testid={`glance-${g.id}`}
          data-tone={g.tone ?? 'checking'}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1 px-3 py-1 text-small"
        >
          <span className="font-medium">{t(GLANCE_KEY[g.id])}</span>
          {g.tone === null ? (
            <Spinner size={14} label={t('loading')} />
          ) : (
            <span className={cn('inline-flex items-center gap-1.5', TONE_CLASS[g.tone])}>
              <span aria-hidden="true" className="size-2 rounded-full bg-current" />
              {t(TONE_KEY[g.tone])}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Values({ expected, actual }: { expected?: string; actual?: string }) {
  const t = useT(status);
  if (expected === undefined && actual === undefined) return null;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
      <dt className="text-ink-muted">{t('expected')}</dt>
      <dd className="voice-ledger min-w-0 wrap-anywhere">
        {expected === undefined ? '—' : <UntrustedText value={expected} max={80} />}
      </dd>
      <dt className="text-ink-muted">{t('found')}</dt>
      <dd className="voice-ledger min-w-0 wrap-anywhere">
        {actual === undefined ? '—' : <UntrustedText value={actual} max={80} />}
      </dd>
    </dl>
  );
}

/**
 * The checks of one integrity report, pure so a unit test can render it (status-integrity.test.tsx): every string that
 * may come from the chain (expected, actual, a warning, an unknown check name) goes through UntrustedText.
 */
export function IntegrityChecks({ report: r }: { report: IntegrityReport }) {
  const t = useT(status);
  const { lang } = useLang();
  return (
    <div data-testid="status-integrity" data-ok={String(r.ok)} className="flex min-w-0 flex-col gap-4">
      <p className="flex flex-col gap-1">
        <span className={cn('font-medium', r.ok ? 'text-alive' : 'text-danger')}>
          {r.ok ? t('integrityOk') : t('integrityBad')}
        </span>
        <span className="voice-ledger text-caption text-ink-muted">
          {/* Cross-check is off by default, so one operator is the common case: said in the singular. */}
          {t(r.rpcs === 1 ? 'integrityAtOne' : 'integrityAt', {
            block: formatCount(r.blockNumber, lang),
            rpcs: r.rpcs,
          })}{' '}
          {t('integrityCount', { ok: r.checks.filter((c) => c.ok).length, all: r.checks.length })}
        </span>
      </p>
      {uniqueWarnings([r.warnings]).map((w) => (
        <Banner key={warningKey(w)} tone="warn" testId={`status-warning-${w.code}`}>
          {/* The one warning the app words itself: the cross-check that answers it is on this page (DeWEB). */}
          {w.code === 'SINGLE_RPC' ? (
            t(ENV.target === 'deweb' ? 'singleRpcCross' : 'singleRpc')
          ) : (
            <UntrustedText value={w.message} max={240} />
          )}
        </Banner>
      ))}
      <ul className="flex flex-col divide-y divide-line">
        {r.checks.map((c) => {
          const k = checkKey(c.name);
          return (
            <li
              key={c.name}
              data-testid="status-check"
              data-name={c.name}
              data-ok={String(c.ok)}
              data-label={String(k !== null)}
              className="flex min-w-0 flex-col gap-1 py-3"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-small">{k ? t(k) : <UntrustedText value={c.name} max={80} />}</span>
                <span className={cn('shrink-0 font-medium text-small', c.ok ? 'text-alive' : 'text-danger')}>
                  {c.ok ? t('pass') : t('fail')}
                </span>
              </span>
              {k ? <span className="voice-ledger text-caption text-ink-muted wrap-anywhere">{c.name}</span> : null}
              {c.ok ? null : <Values expected={c.expected} actual={c.actual} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Check rows before the SDK has read the deployment: the devnet's count (ruling T10-F1). */
const CHECK_ROWS_BEFORE_SDK = 9;
/** Nodes before the SDK has read the deployment: the two X Layer operators. */
const NODE_ROWS_BEFORE_SDK = 2;
const placeholders = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/** The visible "Checking…" of a list that is still being read, said once to a screen reader. */
function Checking() {
  const t = useT(status);
  return (
    <p role="status" className="voice-ledger text-caption text-ink-muted">
      {t('loading')}
    </p>
  );
}

/** The integrity report's shape while it is read: the summary, then one row per check the report will hold. */
function IntegritySkeleton({ rows }: { rows: number }) {
  return (
    <div data-testid="status-integrity-skeleton" aria-hidden="true" className="flex min-w-0 flex-col gap-4">
      <span className="flex flex-col gap-1">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </span>
      <ul className="flex flex-col divide-y divide-line">
        {placeholders(rows).map((k) => (
          <li key={k} className="flex min-w-0 flex-col gap-1 py-3">
            <span className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-[min(22rem,70%)]" />
              <Skeleton className="h-4 w-10 shrink-0" />
            </span>
            <Skeleton className="h-3 w-32" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Integrity({ q }: { q: UseQueryResult<IntegrityReport> }) {
  const t = useT(status);
  const sdk = useSdk();
  const r = q.data;
  const rows = sdk.data ? expectedCheckCount(sdk.data.deployment) : CHECK_ROWS_BEFORE_SDK;
  return (
    <Section id="status-contracts" title={t('integrityTitle')} lead={t('integrityLead')}>
      {sdk.isError ? <ErrorBox error={sdk.error} onRetry={() => void sdk.refetch()} /> : null}
      {q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : null}
      {!r && !q.isError && !sdk.isError ? (
        <>
          <Checking />
          <IntegritySkeleton rows={rows} />
        </>
      ) : null}
      {r ? <IntegrityChecks report={r} /> : null}
    </Section>
  );
}

function Nodes({ probes, onRecheck }: { probes: UseQueryResult<RpcProbe[]>; onRecheck: () => void }) {
  const t = useT(status);
  const { lang } = useLang();
  const s = useSdk().data;
  const nodes = s ? rpcUrlsOf(s.rpc).length : NODE_ROWS_BEFORE_SDK;
  return (
    <Section id="status-nodes" title={t('rpcTitle')} lead={t('rpcLead')}>
      {probes.data ? (
        <ul data-testid="status-rpcs" className="flex flex-col divide-y divide-line">
          {probes.data.map((p, i) => (
            <li
              key={p.url}
              data-testid={`status-rpc-${i}`}
              data-ok={String(p.ok)}
              className="flex min-w-0 flex-col gap-1 py-3"
            >
              <span className="voice-ledger text-small wrap-anywhere">{p.url}</span>
              <span className="flex flex-wrap gap-x-4 text-caption">
                <span className={p.ok ? 'text-alive' : 'text-danger'}>
                  {p.ok ? t('reachable') : t('unreachable', { code: p.error ?? 'UNKNOWN' })}
                </span>
                {p.block === null ? null : (
                  <span className="voice-ledger text-ink-muted">
                    {t('atBlock', { block: formatCount(p.block, lang) })}
                  </span>
                )}
                {p.ms === null ? null : <span className="voice-ledger text-ink-muted">{t('ms', { ms: p.ms })}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <Checking />
          {/* One row per node, as the probes will draw them: the URL, then its answer. */}
          <ul data-testid="status-rpcs-skeleton" aria-hidden="true" className="flex flex-col divide-y divide-line">
            {placeholders(nodes).map((k) => (
              <li key={k} className="flex min-w-0 flex-col gap-1 py-3">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-36" />
              </li>
            ))}
          </ul>
        </>
      )}
      <Button
        data-testid="status-recheck"
        variant="secondary"
        className="self-start"
        loading={probes.isFetching}
        onClick={onRecheck}
      >
        {t('recheck')}
      </Button>
    </Section>
  );
}

/**
 * A sentence with its numbers in the ledger voice: each {param} of the template becomes a mono span, keyed by where it
 * ends in the sentence. A name with no value stays as written.
 */
function ledgered(template: string, params: Params): ReactNode {
  let end = 0;
  return template.split(/\{(\w+)\}/).map((p, i) => {
    if (i % 2 === 0) {
      end += p.length;
      return p;
    }
    const v = p in params ? String(params[p]) : `{${p}}`;
    end += v.length + 1;
    return (
      <span key={end} className="voice-ledger">
        {v}
      </span>
    );
  });
}

/** The verdict of a row, as the check and glance rows give it: a word, with a dot in its tone that a reader skips. */
function Verdict({ tone }: { tone: HealthTone }) {
  const t = useT(status);
  return (
    <span
      data-health-verdict
      className={cn('inline-flex shrink-0 items-center gap-1.5 font-medium text-small', TONE_CLASS[tone])}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-current" />
      {t(TONE_KEY[tone])}
    </span>
  );
}

/** The backend's reports in the rows of the check list: the title and its detail on the left, the verdict on the right. */
export function HealthList({ rows }: { rows: readonly HealthRow[] }) {
  const t = useT(status);
  const { lang } = useLang();
  return (
    <ul data-testid="status-health" className="flex flex-col divide-y divide-line">
      {rows.map((r) => {
        const p: Params = {};
        if (r.ageSec !== null) p.age = formatAge(r.ageSec, lang);
        if (r.block !== null) p.block = formatCount(BigInt(r.block), lang);
        if (r.lag !== null) p.lag = formatCount(r.lag, lang);
        if (r.okb !== null) p.okb = r.okb;
        return (
          <li
            key={r.id}
            data-testid={`status-health-${r.id}`}
            data-tone={r.tone}
            className="flex min-w-0 items-start justify-between gap-4 py-3"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-medium">{t(HEALTH_TITLE[r.id])}</span>
              <span className="text-pretty text-ink-muted text-small">{ledgered(t(r.text), p)}</span>
            </span>
            <Verdict tone={r.tone} />
          </li>
        );
      })}
    </ul>
  );
}

/** The backend's three rows while it is asked, in the shape HealthList will draw them. */
export function HealthSkeleton() {
  return (
    <>
      <Checking />
      <ul data-testid="status-health-skeleton" aria-hidden="true" className="flex flex-col divide-y divide-line">
        {(['indexer', 'integrity', 'keeper'] as const).map((k) => (
          <li key={k} className="flex min-w-0 items-start justify-between gap-4 py-3">
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-[min(18rem,60%)]" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </span>
            <Skeleton className="h-4 w-10 shrink-0" />
          </li>
        ))}
      </ul>
    </>
  );
}

export function StatusPage() {
  const t = useT(status);
  const { lang } = useLang();
  const sdk = useSdk();
  const s = sdk.data;
  const { crossCheck, setCrossCheck } = useChainSettings();
  const { wallets, discover } = useWallet();
  const health = useHealth();
  const stats = useStats();
  const diag = useDiagnosticsImpl();
  const integrity = useIntegrity();
  const probes = useProbes(diag.impl);
  const asked = useRef(false);

  // A count that finishes on this device reads the counters again, with every vault it found (ruling T10-R2).
  const [round, setRound] = useState(0);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !stats.busy && !stats.error) setRound((r) => r + 1);
    wasBusy.current = stats.busy;
  }, [stats.busy, stats.error]);

  useEffect(() => {
    if (asked.current || wallets !== null) return;
    asked.current = true;
    discover().catch(() => undefined);
  }, [wallets, discover]);

  const rows = health.data ? healthRows(health.data, health.dataUpdatedAt) : null;
  const nodesTone: Tone | null = probes.data
    ? probes.data.every((p) => p.ok)
      ? 'ok'
      : probes.data.some((p) => p.ok)
        ? 'warn'
        : 'bad'
    : diag.error
      ? 'unknown'
      : null;
  const glance: { id: GlanceId; tone: Tone | null }[] = [
    // A read that failed is unknown, never red: red is for a check that failed (fix round 1).
    { id: 'contracts', tone: contractsTone(integrity.data, integrity.isError || sdk.isError) },
    { id: 'nodes', tone: nodesTone },
    {
      id: 'backend',
      tone: backendTone({ hosted: IS_VERCEL, rows, failed: health.isError, idle: health.fetchStatus === 'idle' }),
    },
  ];

  const names = (wallets ?? []).map((w) => w.name);
  const text =
    diag.impl && s
      ? diag.impl.buildDiagnostics({
          appVersion: ENV.version,
          target: ENV.target,
          href: window.location.href,
          chainId: s.deployment.chainId,
          integrity: integrity.data ?? null,
          integrityError: integrity.error ?? null,
          probes: probes.data ?? null,
          wallets: names,
          crossCheck,
          lang,
        })
      : null;

  let backend: ReactNode;
  if (!IS_VERCEL) backend = <p data-testid="status-backend-off">{t('backendOff')}</p>;
  else if (rows) backend = <HealthList rows={rows} />;
  else if (health.isError) backend = <ErrorBox error={health.error} onRetry={() => void health.refetch()} />;
  else if (health.fetchStatus === 'idle') backend = <p data-testid="status-backend-none">{t('backendNone')}</p>;
  else backend = <HealthSkeleton />;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-3">
        <Stamp glyph="mark">{t('stamp', { network: networkName(CHAIN_ID) })}</Stamp>
        <h1 className="voice-proclaim text-h1">{t('title')}</h1>
        <p className="text-pretty text-ink-muted text-lead">{t('lead')}</p>
        {/* Ruling T10-R23: the glance sits under the lead, a status page's first answer; the counters stay the first section. */}
        <Glance items={glance} />
      </header>

      <Counters round={round} />
      <EventCount stats={stats} />
      <Integrity q={integrity} />
      <Nodes
        probes={probes}
        onRecheck={() => {
          void integrity.refetch();
          void probes.refetch();
        }}
      />

      {ENV.target === 'deweb' ? (
        <Section id="status-cross" title={t('crossTitle')}>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              data-testid="status-crosscheck"
              checked={crossCheck}
              onChange={(e) => setCrossCheck(e.currentTarget.checked)}
              className="size-4 accent-thread"
            />
            <span>{t('crossLabel')}</span>
          </label>
          <Banner tone="warn" testId="status-crosscheck-warning">
            {t('crossWarning')}
          </Banner>
          {s && s.rpc.offchain.length > 0 ? (
            <div className="flex flex-col gap-2 text-small">
              <p>{t('offchainList')}</p>
              <ul className="flex flex-col gap-1">
                {s.rpc.offchain.map((u) => (
                  <li key={u} className="voice-ledger wrap-anywhere">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section id="status-backend" title={t('backendTitle')}>
        {backend}
      </Section>

      <Section id="status-diag" title={t('diagTitle')} lead={t('diagLead')}>
        <p data-testid="status-wallets" className="text-small">
          {t('walletsSeen')}{' '}
          {wallets === null || wallets.length === 0
            ? t('walletsNone')
            : wallets.map((w, i) => (
                <span key={w.id}>
                  {i > 0 ? ', ' : null}
                  <UntrustedText value={w.name} max={32} />
                </span>
              ))}
        </p>
        {text ? (
          <>
            <CopyButton text={text} label={t('copy')} showText className="self-start" />
            <details>
              <summary className="cursor-pointer text-small">{t('diagShow')}</summary>
              <pre
                data-testid="status-diagnostics"
                className="mt-2 whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 font-mono text-caption wrap-anywhere"
              >
                {text}
              </pre>
            </details>
          </>
        ) : diag.error ? (
          <ErrorBox error={diag.error} onRetry={() => window.location.reload()} />
        ) : (
          <Spinner label={t('loading')} />
        )}
      </Section>
    </div>
  );
}
