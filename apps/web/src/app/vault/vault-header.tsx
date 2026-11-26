'use client';

import type { StateName, TimelineEventKind, VaultSnapshot } from '@atropyle/sdk';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useChainNow } from '@/chain/time';
import type { RegisteredVault, Sdk } from '@/chain/types';
import type { VaultView } from '@/flows/impl/vault-view';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { durationWords } from '@/lib/duration';
import { formatAmount, formatBps } from '@/lib/format';
import { explorerAddress, explorerName } from '@/lib/links';
import { messages as labels, THREAD_STATE_KEY } from '@/messages/labels.messages';
import { messages } from '@/messages/vault.messages';
import { verifyHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { threadStateOf } from '@/thread/state';
import { StateBadge } from '@/thread/state-badge';
import { Thread } from '@/thread/thread';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { Button, buttonClass } from '@/ui/button';
import { Countdown } from '@/ui/countdown';
import { ExternalLink } from '@/ui/external-link';
import { headerThread } from './header-thread';
import { type Moved, momentOf } from './moment';

type VaultKey = keyof typeof messages.en;

const EVENT_KEY = {
  alarm: 'nextAlarm',
  release: 'nextRelease',
  drillExpiry: 'nextDrillExpiry',
} as const satisfies Record<TimelineEventKind, VaultKey>;

const PREDICTED_KEY = {
  active: 'predictedActive',
  grace: 'predictedGrace',
  recovery: 'predictedRecovery',
  releasedInherit: 'predictedReleasedInherit',
  releasedRecover: 'predictedReleasedRecover',
} as const satisfies Record<StateName, VaultKey>;

const MOVED_KEY = {
  active: 'movedActive',
  grace: 'movedGrace',
  recovery: 'movedRecovery',
  releasedInherit: 'movedReleasedInherit',
  releasedRecover: 'movedReleasedRecover',
} as const satisfies Record<StateName, VaultKey>;

/**
 * In Vellum the course still ahead is drawn in --line (#ddd3c2 on #f6f1e7, about 1.3:1): in this header it carries the
 * time left, so it reads at line-strong 60% (about 2.1:1), on a light <html> and on a device that prefers light while
 * the theme follows it. Night keeps the shared Thread's colours. Scoped here: the 7A component does not change.
 */
const COURSE_CLASS = [
  'w-full',
  '[[data-theme=light]_&_.stroke-line]:stroke-line-strong/60',
  '[@media(prefers-color-scheme:light)]:[:root[data-theme=system]_&_.stroke-line]:stroke-line-strong/60',
].join(' ');

export interface VaultHeaderProps {
  sdk: Sdk;
  loaded: RegisteredVault;
  view: VaultView;
  /** The header's first sentence (standing-line.tsx), or nothing. */
  lead?: ReactNode;
  /** The last state change seen: this page's own send, or anyone's between two reads (moment.ts). */
  moved: Moved | null;
  refreshing: boolean;
  onRefresh(): void;
}

/**
 * Spec §5.3 and §18.4.2 T9: Drill or real, the stored state, the vault's own thread on a time axis with its guardians
 * at the gate, the moment line (live from the first paint), Verify and the explorer link.
 */
export function VaultHeader({ sdk, loaded, view, lead, moved, refreshing, onRefresh }: VaultHeaderProps) {
  const t = useT(messages);
  const l = useT(labels);
  const s = loaded.snap.status;
  const read = { blockTimestamp: s.blockTimestamp, fetchedAtMs: loaded.fetchedAtMs };
  // The thread moves slowly: a new length every 30 s is enough, and a boundary brings a new read anyway.
  const now = useChainNow(read, 30_000) ?? s.blockTimestamp;
  const thread = headerThread(loaded.snap.config, s, loaded.timeline, now);
  const moment = momentOf(s, moved);
  const explorer = sdk.deployment.explorerUrl;
  const owner = view.roles.includes('owner');
  const target = s.state === 'recovery' ? s.recoveryTarget : null;
  // The next moment still ahead: one that is already due is the moment line's ("The rules now allow …").
  const next = loaded.timeline.events.find((e) => e.at > s.blockTimestamp) ?? null;
  const p = thread.input.posts;
  const posts = !s.expired && p && p.n > 0 && p.k > 0 ? p : null;
  const stateLabel = l(THREAD_STATE_KEY[thread.state]);
  return (
    <header data-testid="vault-status" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1 text-ink">{t('pageTitle')}</h1>
        <span
          data-testid="vault-kind"
          data-drill={String(view.drill)}
          className="rounded-full border border-line-strong px-3 py-1 text-caption text-ink"
        >
          {view.drill ? t('kindDrill') : t('realVault')}
        </span>
        <span data-testid="vault-state" data-state={view.state}>
          <StateBadge state={threadStateOf(s)} live />
        </span>
      </div>
      {lead}
      {/* self-start: the copy button stays by the groups instead of at the far end of the header. */}
      <Address address={view.vault} explorer={explorer} copy avatar className="self-start" />
      {/* One measure for the thread and what explains it (review fix 5): the last check-in under the now dot, the next
          moment under the gate and the thread's end, the guardians' line under the posts it describes. */}
      <div data-testid="vault-course" className="flex w-full max-w-3xl flex-col gap-3">
        <Thread
          state={thread.state}
          {...thread.input}
          label={thread.predicted ? t('threadPredicted', { state: stateLabel }) : stateLabel}
          className={COURSE_CLASS}
        />
        {posts ? (
          <p data-testid="vault-posts" className="self-end text-right text-caption text-ink-muted">
            {t(thread.state === 'recovery' || thread.state === 'releasedRecover' ? 'postsRecover' : 'postsInherit', {
              lit: posts.lit,
              n: posts.n,
              k: posts.k,
            })}
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-caption text-ink-muted">{t('lastAlive')}</dt>
            <dd data-testid="vault-last-alive" data-ts={String(view.lastAlive)}>
              <Countdown target={view.lastAlive} {...read} />
            </dd>
          </div>
          {next ? (
            <div
              className="flex flex-col items-end gap-1 justify-self-end text-right"
              data-testid="vault-next"
              data-kind={next.kind}
            >
              <dt className="text-caption text-ink-muted">{t(EVENT_KEY[next.kind])}</dt>
              <dd>
                <Countdown target={next.at} {...read} />
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
      {/* Always on the page (7A rule 19): a screen reader hears the rules change, and the alarm being raised. */}
      <p
        data-testid="vault-moment"
        data-moment={moment.kind}
        data-pending={s.pending}
        data-block={moment.kind === 'moved' ? String(moment.block) : undefined}
        aria-live="polite"
        aria-atomic="true"
        className={
          moment.kind === 'none'
            ? 'sr-only'
            : cn('max-w-3xl text-body text-ink', moment.kind === 'predicted' && 'font-medium')
        }
      >
        {moment.kind === 'predicted'
          ? t(PREDICTED_KEY[moment.state])
          : moment.kind === 'moved'
            ? t(MOVED_KEY[moment.state], { block: formatAmount(moment.block, 0) })
            : null}
      </p>
      {view.expired ? (
        <Banner tone="info" testId="vault-expired">
          {t('expired')}
        </Banner>
      ) : null}
      {target ? (
        // Every viewer sees it: heirs, guardians and strangers can warn the owner, who alone can stop it.
        <Banner tone="warn" testId="vault-recovery" title={t('recoveryPending')}>
          <div className="flex flex-col gap-2">
            <Address address={target} explorer={explorer} copy />
            {s.windowEndsAt !== null ? (
              <p>
                {t('windowEnds')} <Countdown target={s.windowEndsAt} {...read} />
              </p>
            ) : null}
            <p>{t(owner ? 'recoveryStopOwner' : 'recoveryStopOther')}</p>
          </div>
        </Banner>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <NavLink
          href={verifyHref(view.vault)}
          data-testid="vault-verify"
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
        >
          <ShieldCheck aria-hidden="true" className="size-4" />
          {t('verify')}
        </NavLink>
        {explorer ? (
          <ExternalLink href={explorerAddress(explorer, view.vault)}>
            {t('explorer', { name: explorerName(explorer) })}
          </ExternalLink>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          data-testid="vault-refresh"
          loading={refreshing}
          icon={<RefreshCw aria-hidden="true" className="size-4" />}
          onClick={onRefresh}
        >
          {t('refresh')}
        </Button>
        <span className="text-caption text-ink-muted">{t('asOf', { block: formatAmount(view.blockNumber, 0) })}</span>
      </div>
    </header>
  );
}

/**
 * What the owner set: heirs and shares, guardians and k, the recovery power, timing. Each column is a container: an
 * address and its share stand side by side only where the column is wide enough (7B T1 #38).
 */
export function VaultPlan({ snap, view, explorer }: { snap: VaultSnapshot; view: VaultView; explorer: string | null }) {
  const t = useT(messages);
  const { lang } = useLang();
  const c = snap.config;
  const owner = view.roles.includes('owner');
  // RECOVERY_POWER (main sync §8): once released or expired, the guardians can no longer vote a recovery.
  const power = c.recoveryEnabled && c.k > 0 && !view.released && !view.expired;
  return (
    <section
      aria-labelledby="vault-plan-title"
      data-testid="vault-plan"
      className="flex flex-col gap-6 rounded-2xl border border-line bg-surface-1 p-4 sm:p-6"
    >
      <h2 id="vault-plan-title" className="text-title text-ink">
        {t('planTitle')}
      </h2>
      {/* Review fix 4: at lg every address keeps two rows of five groups. One with its copy button takes 17.25rem
          (avatar, 25ch of groups, the button); the heirs' column gets the rest, enough for an address and its share. */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[minmax(0,17.25rem)_minmax(0,1fr)_minmax(0,17.25rem)] lg:gap-x-5">
        <div className="@container flex min-w-0 flex-col gap-2">
          <h3 className="text-small text-ink-muted">{t('owner')}</h3>
          <Address address={view.owner} explorer={explorer} size="sm" />
        </div>
        <div className="@container flex min-w-0 flex-col gap-2">
          <h3 className="text-small text-ink-muted">{t('heirs')}</h3>
          <ul className="flex flex-col gap-3">
            {c.heirs.map((h) => (
              <li
                key={h.account}
                className="flex flex-col gap-1 @[18rem]:flex-row @[18rem]:items-center @[18rem]:justify-between @[18rem]:gap-2"
              >
                <Address address={h.account} size="sm" />
                <span className="voice-ledger w-10 shrink-0 text-body text-ink tabular-nums @[18rem]:text-right">
                  {formatBps(h.bps)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="@container flex min-w-0 flex-col gap-2">
          <h3 className="text-small text-ink-muted">{t('guardians')}</h3>
          {c.guardians.length === 0 ? (
            <p className="text-body text-ink-muted">{t('guardiansNone')}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {c.guardians.map((g) => (
                  <li key={g}>
                    <Address address={g} size="sm" />
                  </li>
                ))}
              </ul>
              <p className="text-small text-ink">{t('guardiansK', { k: c.k, n: c.guardians.length })}</p>
            </>
          )}
        </div>
      </div>
      {power ? (
        <Banner tone="warn" testId="vault-recovery-power">
          {t(owner ? 'recoveryPowerOwner' : 'recoveryPowerOther', {
            k: c.k,
            n: c.guardians.length,
            window: durationWords(c.timing.window, lang),
          })}
        </Banner>
      ) : null}
      <p data-testid="vault-timing" className="text-body text-ink">
        {t('timingLine', {
          period: durationWords(c.timing.period, lang),
          threshold: c.timing.threshold,
          window: durationWords(c.timing.window, lang),
        })}
      </p>
    </section>
  );
}
