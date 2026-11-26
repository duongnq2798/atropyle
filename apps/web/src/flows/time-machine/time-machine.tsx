'use client';

import type { EvalState, PolicyEngine } from '@atropyle/sdk';
import { Cpu } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { ScenarioId, ScenarioOptions, ScenarioRun } from '@/flows/impl/time-machine';
import { useLang, useT } from '@/i18n/provider';
import { sameAddress } from '@/lib/address';
import { cn } from '@/lib/cn';
import { durationWords } from '@/lib/duration';
import { chainDate, isoDate, roughDuration } from '@/lib/when';
import { messages as labels, THREAD_STATE_KEY } from '@/messages/labels.messages';
import { messages } from '@/messages/time-machine.messages';
import { THREAD_COLOR, type ThreadState } from '@/thread/state';
import { StateBadge } from '@/thread/state-badge';
import { Thread } from '@/thread/thread';
import { Avatar } from '@/ui/avatar';
import { frameIndex, scrubAxis } from './frame';
import type { TimeMachineImpl } from './load';
import {
  shellShape,
  TIME_MACHINE_BOX,
  TIME_MACHINE_CHIPS,
  TIME_MACHINE_FOOTER,
  TIME_MACHINE_MOMENT,
  TIME_MACHINE_STAGE,
  TIME_MACHINE_STAGE_CLOSED,
  TIME_MACHINE_STAGE_HEAD,
  TIME_MACHINE_SWITCH_ROW,
  TimeMachineShell,
} from './shell';
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
/**
 * The segmented radios of SubscribeForm's LangSwitch, as chips with an edge. On a phone they share one row in equal
 * cells (TIME_MACHINE_CHIPS), and a long name breaks inside its own chip.
 */
const CHIP =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-line px-2 text-center ' +
  'text-ink-muted text-small leading-tight transition-colors duration-150 hover:text-ink sm:px-4 ' +
  'has-checked:border-thread has-checked:bg-surface-2 has-checked:font-medium has-checked:text-ink ' +
  'has-focus-visible:outline-2 has-focus-visible:outline-thread has-focus-visible:outline-offset-2';
/** A vault that ended: what its rules decided, under its thread. */
const CLOSED_KEY: Partial<Record<ThreadState, 'closedReleased' | 'closedRecover' | 'closedExpired'>> = {
  releasedInherit: 'closedReleased',
  releasedRecover: 'closedRecover',
  expired: 'closedExpired',
};
/** "I check in again" is a native checkbox drawn as a switch: the track follows the input (peer), the knob slides. */
const SWITCH =
  'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-line-strong bg-surface-3 ' +
  'transition-colors duration-150 peer-checked:border-thread peer-checked:bg-thread ' +
  'peer-focus-visible:outline-2 peer-focus-visible:outline-thread peer-focus-visible:outline-offset-2 ' +
  'group-hover:border-ink-muted peer-checked:[&>span]:translate-x-4 peer-checked:[&>span]:bg-on-thread';
const KNOB =
  'ml-0.5 block size-4.5 rounded-full bg-ink-muted shadow-sm motion-safe:transition-transform motion-safe:duration-150';

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
      shape={shellShape(state, now, expiresAt)}
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

  const closed = axis.span === 0;
  const closedKey = closed ? CLOSED_KEY[threadState] : undefined;
  const bases = BASES.filter((b) => has(b));
  const scenarioPicker =
    runs.length > 1 ? (
      <fieldset className="min-w-0">
        <legend className="mb-2 text-ink-muted text-small">{t('whatIf')}</legend>
        <div className={cn(TIME_MACHINE_CHIPS, bases.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {bases.map((b) => (
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
          {/*
           * On a phone, its own row under the chips, after a hairline; from sm up, after the chips on their row,
           * past a divider. Under Silent there is no return: it is disabled, dimmed on a phone so that row is never
           * a hole, and out of sight from sm up (visibility hides it from assistive technology too), keeping its
           * place so nothing moves when the chips change.
           */}
          <label
            className={cn(
              'group cursor-pointer text-ink',
              TIME_MACHINE_SWITCH_ROW,
              silent && 'sm:invisible',
              !canBack && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="checkbox"
              checked={back && canBack}
              disabled={!canBack}
              onChange={(e) => setBack(e.currentTarget.checked)}
              className="peer sr-only"
            />
            <span aria-hidden="true" className={SWITCH}>
              <span className={KNOB} />
            </span>
            {t('checkInAgain')}
          </label>
        </div>
      </fieldset>
    ) : null;

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
        <p className="text-ink-muted text-small">{closed ? t('closed') : t('intro')}</p>
      </header>

      {scenarioPicker}

      {/*
       * The stage: the frame's state and date, the thread to drag, and the frame's sentence as its caption. Right
       * under the chips, with nothing between that changes length, so a new scenario never moves the thread that is
       * being compared (the story it tells comes after it).
       */}
      <div data-part="stage" className={cn(TIME_MACHINE_STAGE, closed && TIME_MACHINE_STAGE_CLOSED)}>
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 -z-10 h-2/3 opacity-[0.09]',
            'bg-[radial-gradient(60%_100%_at_50%_0%,currentColor,transparent)]',
            THREAD_COLOR[threadState],
          )}
        />
        <div className={TIME_MACHINE_STAGE_HEAD}>
          <StateBadge state={threadState} drill={drill} />
          <time dateTime={isoDate(at)} className="font-mono text-caption text-ink-muted tabular-nums">
            {chainDate(at, lang, withTime)}
          </time>
        </div>

        {closed ? (
          <Thread state={threadState} className="w-full" />
        ) : (
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
            playhead={(a) => when(Number(a - axis.from))}
            gateLabel={(a, s) =>
              t(s === 'recovery' || s === 'releasedRecover' ? 'gateWallet' : 'gateHeirs', {
                when: when(Number(a - axis.from)),
              })
            }
            testId={`${testId}-scrubber`}
          />
        )}

        {/* Below the thread, so a sentence that wraps never moves the thread under a finger. Not live: the
            Scrubber's own region speaks once per moment. A vault that ended says what its rules decided. */}
        {closed ? (
          closedKey ? (
            <p className="text-balance text-ink text-lead">{t(closedKey)}</p>
          ) : null
        ) : (
          <p className="text-balance text-ink text-lead">{sentence(index)}</p>
        )}
      </div>
      {closed ? null : <p className="-mt-2 text-pretty text-ink-muted text-small">{about}</p>}
      {/*
       * The keys, on a line of their own: no use to a finger, so hidden on a touch screen, and still read with the
       * thumb (aria-describedby). The space keeps the two sentences apart when they are read as one description.
       */}
      {closed ? null : (
        <p id={hintId} className="-mt-2 text-pretty text-caption text-ink-muted">
          {t('hint')}
          <span className="block text-balance pointer-coarse:sr-only"> {t('hintKeys')}</span>
        </p>
      )}

      {closed ? null : (
        <div className="flex flex-col gap-2">
          <h3 id={listId} className="font-display text-ink text-small">
            {t('moments')}
          </h3>
          <ol aria-labelledby={listId} data-testid={`${testId}-moments`} className="flex flex-col">
            {run.moments.map((m, i) => {
              const reached = i <= index;
              const last = i === run.moments.length - 1;
              return (
                <li key={`${m.kind}:${m.at}:${m.who ?? ''}`} className="relative">
                  {last ? null : (
                    // The rail to the next moment: drawn in ink once the time machine has passed it.
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute top-[1.28rem] -bottom-[1.28rem] left-[calc(1.125rem_-_0.5px)] z-[1] w-px',
                        i < index ? 'bg-ink-muted' : 'bg-line',
                      )}
                    />
                  )}
                  <button
                    type="button"
                    data-testid={`${testId}-moment-${i}`}
                    aria-current={i === index ? 'step' : undefined}
                    onClick={() => setOffset(Number(m.at - axis.from))}
                    className={cn(
                      TIME_MACHINE_MOMENT,
                      'w-full rounded-xl text-left transition-colors duration-150 hover:bg-surface-2',
                      'focus-visible:outline-2 focus-visible:outline-thread',
                      i === index && 'bg-surface-2',
                    )}
                  >
                    <span aria-hidden="true" className="flex h-[1.3125rem] items-center justify-center">
                      <span
                        className={cn(
                          'relative z-[2] size-2.5 rounded-full border-2 border-current',
                          THREAD_COLOR[m.state],
                          reached ? 'bg-current' : 'bg-surface-1',
                          i === index && 'ring-4 ring-current/20',
                        )}
                      />
                    </span>
                    <span className="font-mono text-caption text-ink-muted tabular-nums leading-[1.3125rem]">
                      {when(Number(m.at - axis.from))}
                    </span>
                    <span
                      className={cn(
                        'col-start-2 flex min-w-0 items-start gap-2 text-small sm:col-start-3',
                        reached ? 'text-ink' : 'text-ink-muted',
                      )}
                    >
                      {m.who !== null && m.kind !== 'checkIn' ? (
                        <span className="flex h-[1.3125rem] shrink-0 items-center">
                          <Avatar address={m.who} size={18} />
                        </span>
                      ) : null}
                      <span className="text-pretty">{sentence(i)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {/* A closed vault's one frame is its state as read, not a moment the engine computed. */}
      {closed ? null : (
        <p className={TIME_MACHINE_FOOTER}>
          <Cpu aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span className="text-pretty">{run.engine === 'netlist' ? t('engineNetlist') : t('engineModel')}</span>
        </p>
      )}
    </section>
  );
}
