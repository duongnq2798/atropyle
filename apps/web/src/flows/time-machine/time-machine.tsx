'use client';

import type { EvalState, PolicyEngine } from '@atropyle/sdk';
import { useId, useMemo, useState } from 'react';
import type { ScenarioId, ScenarioOptions, ScenarioRun } from '@/flows/impl/time-machine';
import { useLang, useT } from '@/i18n/provider';
import { sameAddress } from '@/lib/address';
import { cn } from '@/lib/cn';
import { durationWords } from '@/lib/duration';
import { chainDate, isoDate, roughDuration } from '@/lib/when';
import { messages as labels, THREAD_STATE_KEY } from '@/messages/labels.messages';
import { messages } from '@/messages/time-machine.messages';
import type { ThreadState } from '@/thread/state';
import { StateBadge } from '@/thread/state-badge';
import { Thread } from '@/thread/thread';
import { Avatar } from '@/ui/avatar';
import { frameIndex, scrubAxis } from './frame';
import type { TimeMachineImpl } from './load';
import { TIME_MACHINE_BOX, TimeMachineShell } from './shell';
import { type EngineBinding, usePolicyEngine } from './use-engine';
import { useTimeMachine } from './use-time-machine';

type Base = 'silent' | 'confirm' | 'recover';
const BASES: readonly Base[] = ['silent', 'confirm', 'recover'];
const BASE_OF: Record<ScenarioId, Base> = {
  silent: 'silent',
  confirm: 'confirm',
  returns: 'confirm',
  recover: 'recover',
  recoverBlocked: 'recover',
};
/** What the "I check in again" switch turns a chip into. */
const BACK_OF: Record<Base, ScenarioId | null> = { silent: null, confirm: 'returns', recover: 'recoverBlocked' };
const CHIP_KEY = { silent: 'scSilent', confirm: 'scConfirm', recover: 'scRecover' } as const;
const ABOUT_KEY = {
  silent: 'aboutSilent',
  confirm: 'aboutConfirm',
  recover: 'aboutRecover',
  returns: 'aboutReturns',
  recoverBlocked: 'aboutRecoverBlocked',
} as const;
/** Under two days the moments are minutes apart (a Drill): the dates say the time of day. */
const WITH_TIME_BELOW = 2 * 86_400;
/** The segmented radios of SubscribeForm's LangSwitch, as chips with an edge. */
const CHIP =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-line px-4 text-ink-muted ' +
  'text-small transition-colors duration-150 hover:text-ink has-checked:border-thread has-checked:bg-surface-2 ' +
  'has-checked:font-medium has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-thread ' +
  'has-focus-visible:outline-offset-2';

type MomentKey =
  | 'momentNow'
  | 'momentAlarm'
  | 'momentAttest'
  | 'momentVote'
  | 'momentVoteStarts'
  | 'momentCheckIn'
  | 'momentCheckInAlarm'
  | 'momentCheckInRecovery'
  | 'momentRelease'
  | 'momentReleaseRecover'
  | 'momentExpiry';

/** The sentence of moment `i`: a check-in and a vote read by what they change. */
function momentKey(run: ScenarioRun, i: number): MomentKey {
  const m = run.moments[i];
  const before = i > 0 ? run.moments[i - 1].state : null;
  switch (m.kind) {
    case 'now':
      return 'momentNow';
    case 'alarm':
      return 'momentAlarm';
    case 'attest':
      return 'momentAttest';
    case 'vote':
      return m.state === 'recovery' && before !== 'recovery' ? 'momentVoteStarts' : 'momentVote';
    case 'checkIn':
      return before === 'grace'
        ? 'momentCheckInAlarm'
        : before === 'recovery'
          ? 'momentCheckInRecovery'
          : 'momentCheckIn';
    case 'drillExpiry':
      return 'momentExpiry';
    default:
      return m.state === 'releasedRecover' ? 'momentReleaseRecover' : 'momentRelease';
  }
}

export interface TimeMachineProps {
  /** The vault's policy state now (`evalStateOf(snap)`, or the plan as a state in the wizard). Memoize it. */
  state: EvalState;
  /** Chain time of that state (the read's block time), not a ticking clock: a new value recomputes every frame. */
  now: bigint;
  expiresAt: bigint | null;
  drill: boolean;
  /** The vault's policy binding (`snap.binding`), or null for the deployment's own engine (a plan, no vault yet). */
  binding: EngineBinding | null;
  /** An engine at hand (a preview, a test): nothing is read. */
  engine?: PolicyEngine;
  /** When each signed step of the scenarios happens (memoize it too); the defaults otherwise. */
  options?: ScenarioOptions;
  testId?: string;
  className?: string;
}

/** Spec §4.6.2: drag through time on the thread; every frame is the policy engine's answer, never a drawing. */
export function TimeMachine({
  state,
  now,
  expiresAt,
  drill,
  binding,
  engine,
  options,
  testId = 'time-machine',
  className,
}: TimeMachineProps) {
  const tm = useTimeMachine();
  const read = usePolicyEngine(binding, { enabled: engine === undefined });
  const impl = tm.data ?? null;
  const policy = engine ?? read.data ?? null;
  const runs = useMemo(
    () => (impl && policy ? impl.scenarios(policy, state, now, expiresAt, drill, options) : null),
    [impl, policy, state, now, expiresAt, drill, options],
  );
  if (impl && runs) {
    return (
      <Stage
        impl={impl}
        runs={runs}
        state={state}
        expiresAt={expiresAt}
        drill={drill}
        testId={testId}
        className={className}
      />
    );
  }
  return (
    <TimeMachineShell
      testId={testId}
      className={className}
      error={tm.error ?? (engine === undefined ? read.error : null)}
      onRetry={() => {
        if (tm.isError) void tm.refetch();
        if (read.isError) void read.refetch();
      }}
    />
  );
}

interface StageProps {
  impl: TimeMachineImpl;
  runs: ScenarioRun[];
  state: EvalState;
  expiresAt: bigint | null;
  drill: boolean;
  testId: string;
  className?: string;
}

function Stage({ impl, runs, state, expiresAt, drill, testId, className }: StageProps) {
  const t = useT(messages);
  const tl = useT(labels);
  const { lang } = useLang();
  const titleId = useId();
  const hintId = useId();
  const listId = useId();
  const chips = useId();
  const [base, setBase] = useState<Base>('silent');
  const [back, setBack] = useState(false);
  // Seconds after now; kept across scenarios, so two of them can be compared at the same time.
  const [offset, setOffset] = useState(0);

  const has = (id: ScenarioId | null) => id !== null && runs.some((r) => r.id === id);
  const backId = BACK_OF[base];
  const wanted: ScenarioId = back && backId !== null && has(backId) ? backId : base;
  const run = runs.find((r) => r.id === wanted) ?? runs[0];
  const shown = BASE_OF[run.id];
  const canBack = has(BACK_OF[shown]);
  const silent = shown === 'silent';
  const axis = useMemo(() => scrubAxis(run), [run]);
  const value = Math.min(Math.max(0, offset), axis.span);
  const at = axis.from + BigInt(value);
  const index = frameIndex(run, at);
  const threadState: ThreadState = expiresAt !== null && at >= expiresAt ? 'expired' : run.moments[index].state;
  const withTime = axis.span < WITH_TIME_BELOW;

  const when = (seconds: number) => (seconds <= 0 ? t('now') : t('inTime', { time: roughDuration(seconds, lang) }));
  const sentence = (i: number) => {
    const m = run.moments[i];
    const n = m.who !== null && m.kind !== 'checkIn' ? state.guardians.findIndex((g) => sameAddress(g, m.who)) + 1 : 0;
    return t(momentKey(run, i), { who: n > 0 ? t('guardian', { n }) : '' });
  };
  const about = t(ABOUT_KEY[run.id], {
    k: state.k,
    n: state.guardians.length,
    window: durationWords(state.timing.window, lang),
  });
  const Scrubber = impl.Scrubber;

  return (
    <section
      data-testid={testId}
      data-engine={run.engine}
      data-scenario={run.id}
      data-state={threadState}
      aria-labelledby={titleId}
      className={cn(TIME_MACHINE_BOX, className)}
    >
      <header className="flex flex-col gap-1.5">
        <h2 id={titleId} className="font-display text-ink text-title">
          {t('title')}
        </h2>
        <p className="text-ink-muted text-small">{t('intro')}</p>
      </header>

      {runs.length > 1 ? (
        <div className="flex flex-col gap-2">
          <fieldset className="min-w-0">
            <legend className="mb-2 text-ink-muted text-small">{t('whatIf')}</legend>
            <div className="flex flex-wrap gap-2">
              {BASES.filter((b) => has(b)).map((b) => (
                <label key={b} className={CHIP}>
                  <input
                    type="radio"
                    name={chips}
                    value={b}
                    checked={shown === b}
                    onChange={() => setBase(b)}
                    className="sr-only"
                  />
                  {t(CHIP_KEY[b])}
                </label>
              ))}
            </div>
          </fieldset>
          {/* Kept in place under Silent, out of sight and of the accessibility tree: the chips never jump. */}
          <label
            aria-hidden={silent || undefined}
            inert={silent}
            className={cn(
              'flex min-h-11 w-fit cursor-pointer items-center gap-3 text-ink text-small',
              silent && 'invisible',
              !canBack && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="checkbox"
              checked={back && canBack}
              disabled={!canBack}
              onChange={(e) => setBack(e.currentTarget.checked)}
              className="size-5 accent-thread"
            />
            {t('checkInAgain')}
          </label>
        </div>
      ) : null}
      <p className="text-ink-muted text-small">{about}</p>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StateBadge state={threadState} drill={drill} />
          <p className="font-mono text-caption text-ink-muted tabular-nums">
            {when(value)} · <time dateTime={isoDate(at)}>{chainDate(at, lang, withTime)}</time>
          </p>
        </div>
        {/* Not live: the Scrubber's own region speaks once per moment. */}
        <p className="text-ink text-lead">{sentence(index)}</p>
      </div>

      {axis.span > 0 ? (
        <div className="flex flex-col gap-2">
          <Scrubber
            key={run.id}
            run={run}
            expiresAt={expiresAt}
            offset={value}
            onOffsetChange={setOffset}
            label={t('slider')}
            valueText={(a, _i, s) =>
              t('valueText', {
                when: when(Number(a - axis.from)),
                date: chainDate(a, lang, withTime),
                state: tl(THREAD_STATE_KEY[s]),
              })
            }
            announce={(i) => sentence(i)}
            describedBy={hintId}
            testId={`${testId}-scrubber`}
          />
          <div aria-hidden="true" className="flex justify-between px-5.5 font-mono text-caption text-ink-muted">
            <span>{t('now')}</span>
            <span>{when(axis.span)}</span>
          </div>
          <p id={hintId} className="text-caption text-ink-muted">
            {t('hint')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Thread state={threadState} className="w-full" />
          <p className="text-ink-muted text-small">{t('closed')}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 id={listId} className="text-ink-muted text-small">
          {t('moments')}
        </h3>
        <ol aria-labelledby={listId} data-testid={`${testId}-moments`} className="flex flex-col gap-1">
          {run.moments.map((m, i) => (
            <li key={`${m.kind}:${m.at}:${m.who ?? ''}`}>
              <button
                type="button"
                data-testid={`${testId}-moment-${i}`}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => setOffset(Number(m.at - axis.from))}
                className={cn(
                  'flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-left',
                  'transition-colors duration-150 hover:bg-surface-2',
                  'focus-visible:outline-2 focus-visible:outline-thread',
                  i === index && 'bg-surface-2',
                )}
              >
                <span className="w-28 shrink-0 font-mono text-caption text-ink-muted tabular-nums">
                  {when(Number(m.at - axis.from))}
                </span>
                <span className="flex min-w-0 items-center gap-2 text-ink text-small">
                  {m.who !== null && m.kind !== 'checkIn' ? <Avatar address={m.who} size={18} /> : null}
                  {sentence(i)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-caption text-ink-muted">{run.engine === 'netlist' ? t('engineNetlist') : t('engineModel')}</p>
    </section>
  );
}
