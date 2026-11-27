'use client';

import type { VaultAction } from '@atropyle/sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { SubscribeForm } from '@/components/subscribe/SubscribeForm';
import { LazyTimeMachine } from '@/flows/time-machine/lazy';
import { useT } from '@/i18n/provider';
import { type LazyChunk, lazyChunk } from '@/lib/lazy-chunk';
import { messages } from '@/messages/owner.messages';
import { ErrorBox } from '@/tx/error-box';
import type { MirrorToken } from '@/tx/mirror';
import { Button } from '@/ui/button';
import { Skeleton, SkeletonText } from '@/ui/skeleton';
import { UntrustedText } from '@/ui/untrusted-text';
import type * as EditModule from './edit-config';
import { PublicActions } from './guest';
import { LazyActionFlow } from './lazy-action-flow';
import { EDIT_PARTS, type EditPart, ownerTokens } from './owner-view';
import { Ritual } from './ritual';
import type { PanelProps } from './vault-page';

/** The wizard's four editors, out of the owner tab's own chunk: loaded the first time the owner picks a part. */
export const editConfigChunk: LazyChunk<typeof EditModule> = lazyChunk(() => import('./edit-config'));

const REVOKE: VaultAction = { type: 'revokeAll' };

/** The alerts form's role (an expression: a literal `role` reads as an ARIA role to the linter). */
const ALERTS_ROLE = 'owner' as const;

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line bg-surface-1 p-4 sm:p-6';

const PART_KEY = {
  heirs: 'partHeirs',
  guardians: 'partGuardians',
  timing: 'partTiming',
  assets: 'partAssets',
} as const satisfies Record<EditPart, keyof typeof messages.en>;

type WithTokens = PanelProps & { tokens: readonly MirrorToken[] };

/**
 * The owner's tab (spec §16.2, §18.4.2 T10): the check-in ritual first, then coverage, the plan's four parts, revoke,
 * the time machine and reminders. A released or expired vault keeps only what still means something: the closing
 * line, Deliver once released, and Revoke while the plan lists assets.
 */
export function OwnerTab(p: PanelProps) {
  const { loaded, view } = p;
  const t = useT(messages);
  const open = !view.released && !view.expired;
  const tokens = useMemo(() => ownerTokens(loaded.snap), [loaded.snap]);
  return (
    <div data-testid="owner-tab" className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 className="text-title text-ink">{t('title')}</h2>
        <p className="text-body text-ink-muted">{t('lead')}</p>
      </header>

      <section aria-labelledby="owner-ritual-title" className={CARD}>
        <h3 id="owner-ritual-title" className="voice-proclaim text-title text-ink">
          {t(open ? 'ritualTitle' : 'closedTitle')}
        </h3>
        {open ? <Ritual {...p} /> : <Closed {...p} />}
      </section>

      {open ? <CoverageSection {...p} tokens={tokens} /> : null}
      {open ? <EditSection {...p} /> : null}
      <RevokeSection {...p} tokens={tokens} />
      {open ? <TimeSection {...p} /> : null}

      {/* The alerts form is its own titled card (SubscribeForm): a second frame around it would only repeat it. */}
      {open ? (
        <div data-testid="owner-alerts">
          <SubscribeForm vault={view.vault} role={ALERTS_ROLE} />
        </div>
      ) : null}
    </div>
  );
}

/** No more check-ins. Released and not expired, anyone may deliver (T9 R7: never a poke from the owner before). */
function Closed(p: PanelProps) {
  const t = useT(messages);
  const { view } = p;
  return (
    <div className="flex flex-col gap-4">
      <p
        data-testid="owner-closed"
        data-kind={view.expired ? 'expired' : 'released'}
        className="text-body text-ink-muted"
      >
        {t(view.expired ? 'closedExpired' : 'closedReleased')}
      </p>
      {view.released && !view.expired ? <PublicActions {...p} /> : null}
    </div>
  );
}

/** Shown while some asset is covered below 100 %, and kept with its receipt while a fix is on screen. */
function CoverageSection({ flows, sdk, loaded, view, account, onChanged, tokens }: WithTokens) {
  const t = useT(messages);
  const [held, setHeld] = useState(false);
  const [done, setDone] = useState(false);
  const config = loaded.snap.config;
  const action = useMemo(() => flows.fixCoverageAction(config), [flows, config]);
  const low = view.assets.filter((a) => view.lowCoverage.includes(a.index));
  if (low.length === 0 && !held && !done) return null;
  return (
    <section aria-labelledby="owner-coverage-title" data-testid="owner-coverage" className={CARD}>
      <h3 id="owner-coverage-title" className="text-lead text-ink">
        {t('coverageTitle')}
      </h3>
      <p className="text-small text-ink-muted">{t('coverageHelp')}</p>
      {low.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {low.map((a) => (
            <li
              key={a.index}
              data-testid={`owner-coverage-${a.index}`}
              data-percent={a.percent ?? ''}
              className="flex flex-wrap items-baseline gap-2 text-small text-ink"
            >
              <UntrustedText value={a.info.symbol} max={16} className="voice-ledger" />
              <span className="voice-ledger tabular-nums">{t('coveragePercent', { percent: a.percent ?? 0 })}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <LazyActionFlow
        flows={flows}
        sdk={sdk}
        vault={view.vault}
        drill={view.drill}
        action={action}
        as={account}
        label={t('fixCoverage')}
        testId="owner-coverage-fix"
        tokens={tokens}
        onPlan={setHeld}
        onDone={(r) => {
          setDone(true);
          onChanged(r);
        }}
        onReset={() => setDone(false)}
      />
    </section>
  );
}

function EditLoading() {
  const t = useT(messages);
  return (
    <div data-testid="owner-edit-loading" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{t('editLoading')}</span>
      <Skeleton className="h-10 w-full" />
      <SkeletonText lines={3} />
    </div>
  );
}

/** Four parts, each its own save. The editors' chunk loads on the first pick, warmed by pointerenter and focus. */
function EditSection(p: PanelProps) {
  const t = useT(messages);
  const [part, setPart] = useState<EditPart | null>(null);
  const [opened, setOpened] = useState(false);
  const [locked, setLocked] = useState(false);
  const q = useQuery({
    queryKey: ['atropyle', 'owner-edit-view'],
    queryFn: editConfigChunk.load,
    initialData: () => editConfigChunk.peek() ?? undefined,
    enabled: opened,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
  const warm = () => editConfigChunk.preload();
  const Edit = q.data?.EditConfig;
  return (
    <section aria-labelledby="owner-edit-title" data-testid="owner-edit" data-part={part ?? ''} className={CARD}>
      <h3 id="owner-edit-title" className="text-lead text-ink">
        {t('editTitle')}
      </h3>
      <p className="text-small text-ink-muted">{t('editHelp')}</p>
      <fieldset className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <legend className="sr-only">{t('partLabel')}</legend>
        {EDIT_PARTS.map((x) => (
          <Button
            key={x}
            variant={part === x ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={part === x}
            data-testid={`owner-edit-${x}`}
            disabled={locked}
            onPointerEnter={warm}
            onFocus={warm}
            onClick={() => {
              setOpened(true);
              setPart((cur) => (cur === x ? null : x));
            }}
          >
            {t(PART_KEY[x])}
          </Button>
        ))}
      </fieldset>
      {!opened ? null : Edit ? (
        <Edit {...p} part={part} onLocked={setLocked} />
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} testId="owner-edit-error" />
      ) : part ? (
        <EditLoading />
      ) : null}
    </section>
  );
}

/**
 * Revoke stays whenever the plan lists assets, released vault included: an owner who is alive when the vault passed
 * on can still stop every transfer not yet made. The page never guesses an allowance: AssetStatus.coverage is
 * min(allowance, balance), so an owner with nothing left to move may still have granted one (an unlimited approval
 * after a distribute). The SDK's revokeAll reads each allowance and zeroes every one it cannot rule out
 * (prepare/approvals.ts revokeDrafts: "a revocation is never skipped on a guess").
 */
function RevokeSection({ flows, sdk, loaded, view, account, onChanged, tokens }: WithTokens) {
  const t = useT(messages);
  const [held, setHeld] = useState(false);
  const [done, setDone] = useState(false);
  const listed = loaded.snap.config.assets.length > 0;
  // A true line from what the page read: nothing can move right now. It says nothing about the allowance.
  const idle = !loaded.snap.status.assets.some((a) => a.coverage > 0n);
  const help = view.expired ? 'revokeHelpExpired' : view.released ? 'revokeHelpReleased' : 'revokeHelp';
  return (
    <section aria-labelledby="owner-revoke-title" data-testid="owner-revoke-card" className={CARD}>
      <h3 id="owner-revoke-title" className="text-lead text-ink">
        {t('revokeTitle')}
      </h3>
      {!listed && !held && !done ? (
        <p data-testid="owner-revoke-none" className="text-small text-ink-muted">
          {t('revokeNone')}
        </p>
      ) : (
        <>
          <p className="text-small text-ink-muted">{t(help)}</p>
          {idle && !held && !done ? (
            <p data-testid="owner-revoke-idle" className="text-small text-ink-muted">
              {t('revokeIdle')}
            </p>
          ) : null}
          <LazyActionFlow
            flows={flows}
            sdk={sdk}
            vault={view.vault}
            drill={view.drill}
            action={REVOKE}
            as={account}
            label={t('revoke')}
            testId="owner-revoke"
            variant="secondary"
            tone="danger"
            tokens={tokens}
            onPlan={setHeld}
            onDone={(r) => {
              setDone(true);
              onChanged(r);
            }}
            onReset={() => setDone(false)}
          />
        </>
      )}
    </section>
  );
}

/** The time machine is its own titled section, with its lead and its frame: it stands here as it is. */
function TimeSection({ flows, loaded, view }: PanelProps) {
  const snap = loaded.snap;
  const state = useMemo(() => flows.evalStateOf(snap), [flows, snap]);
  return (
    <LazyTimeMachine
      state={state}
      now={snap.status.blockTimestamp}
      expiresAt={snap.status.expiresAt}
      drill={view.drill}
      binding={snap.binding}
      testId="owner-time"
    />
  );
}
