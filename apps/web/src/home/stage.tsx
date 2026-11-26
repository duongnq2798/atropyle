'use client';

import { type ReactNode, useId, useMemo, useRef, useState } from 'react';
import { frameIndex, gateOf, momentRings, type ScrubAxis, scrubAxis, threadFrame } from '@/flows/time-machine/frame';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { durationWords } from '@/lib/duration';
import { useIntent } from '@/lib/use-intent';
import { useMounted } from '@/lib/use-mounted';
import { messages as labels, THREAD_STATE_KEY } from '@/messages/labels.messages';
import { messages } from '@/messages/stage.messages';
import { messages as warnings } from '@/messages/warnings.messages';
import { courseX, pctX, pctY, waveY } from '@/thread/geometry';
import { THREAD_COLOR, type ThreadState } from '@/thread/state';
import { StateBadge } from '@/thread/state-badge';
import { Thread } from '@/thread/thread';
import { CHIP_FACE, DOOR } from './look';
import { Scene, Stamp } from './scene';
import {
  type Beat,
  type BeatKey,
  beatAt,
  beatsOf,
  type Chip,
  DAY,
  dayOf,
  HOME_VAULT,
  INHERIT_DAYS,
  PERIOD_DAYS,
  RECOVER_DAYS,
  STAGE_RUNS,
  type StageRun,
  storyOf,
  WINDOW_DAYS,
} from './sim-days';
import { type StagePhase, useStage } from './use-stage';

type Key = keyof typeof messages.en;
const TITLE: Record<BeatKey, Key> = {
  start: 'titleStart',
  quiet: 'titleQuiet',
  alarm: 'titleAlarm',
  confirm: 'titleConfirm',
  back: 'titleBack',
  backRecovery: 'titleBack',
  vote: 'titleVote',
  voteEnough: 'titleVoteEnough',
  gate: 'titleGate',
  gateFallback: 'titleGate',
  gateRecover: 'titleGateRecover',
};
const SAY: Record<BeatKey, Key> = {
  start: 'sayStart',
  quiet: 'sayQuiet',
  alarm: 'sayAlarm',
  confirm: 'sayConfirm',
  back: 'sayBack',
  backRecovery: 'sayBackRecovery',
  vote: 'sayVote',
  voteEnough: 'sayVoteEnough',
  gate: 'sayGate',
  gateFallback: 'sayGateFallback',
  gateRecover: 'sayGateRecover',
};
const CHIPS: readonly Chip[] = ['inherit', 'recover'];
const CHIP_KEY = { inherit: 'chipInherit', recover: 'chipRecover' } as const satisfies Record<Chip, Key>;
/** "I come back" on its story's day: HOME_OPTIONS.returnAt, or blockAt under Recovery. */
const BACK_DAY: Record<Chip, number> = { inherit: INHERIT_DAYS.back, recover: RECOVER_DAYS.block };
const FOOT = { prerender: 'footPrerender', live: 'footLive', failed: 'footFailed' } as const satisfies Record<
  StagePhase,
  Key
>;
const PHASES: readonly StagePhase[] = ['prerender', 'live', 'failed'];
const READY: Record<StagePhase, string> = { prerender: 'false', live: 'true', failed: 'error' };
const seconds = (days: number): number => days * Number(DAY);

/** 7B's switch (flows/time-machine/time-machine.tsx): a native checkbox drawn as a track and a knob. */
const SWITCH =
  'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-line-strong bg-surface-3 ' +
  'transition-colors duration-150 peer-checked:border-thread peer-checked:bg-thread ' +
  'peer-focus-visible:outline-2 peer-focus-visible:outline-thread peer-focus-visible:outline-offset-2 ' +
  'group-hover:border-ink-muted peer-checked:[&>span]:translate-x-4 peer-checked:[&>span]:bg-on-thread';
const KNOB =
  'ml-0.5 block size-4.5 rounded-full bg-ink-muted shadow-sm motion-safe:transition-transform motion-safe:duration-150';
const PANEL =
  'relative isolate flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-surface-1 p-4 sm:p-6 ' +
  'lg:sticky lg:top-24 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1 lg:self-start';
const GLOW =
  'pointer-events-none absolute inset-x-0 top-0 -z-10 h-2/3 rounded-t-3xl opacity-[0.09] ' +
  'bg-[radial-gradient(60%_100%_at_50%_0%,currentColor,transparent)]';
/**
 * The Scrubber's box before it loads (scrubber.tsx: the slider root with --tm-r, 3:1 on a phone and 5:1 from 32rem;
 * the track inset by half the 2.75rem thumb; the Thread (100cqw − 2.75rem) / --tm-r high), with the same Thread and
 * rings, so the swap moves nothing (e2e "the Scrubber takes the still thread's place"). scrubber.tsx itself is not
 * imported on / (time-machine-load.test.ts): it comes with Radix Slider.
 */
const STILL_ROOT = 'relative flex w-full items-center [--tm-r:3] @min-[32rem]:[--tm-r:5]';
const STILL_TRACK = 'relative block min-w-0 grow mx-5.5';
const STILL_THREAD = 'w-full h-[calc((100cqw_-_2.75rem)/var(--tm-r))]';
/** As in scrubber.tsx: the gate's label steps aside near the playhead, and stands under the arch's legs. */
const GATE_LABEL_NEAR = 12;
const GATE_FOOT = 21;

type Gate = { at: bigint; state: ThreadState };
type GateWords = (at: bigint, state: ThreadState) => string;

/**
 * A hyphenated word ("check-in") in a span that keeps it on one line: Chromium may break a line after an ASCII
 * hyphen, and a line that ends in "check-" reads as a typo. The strings stay as written, so a search and the tests
 * still find them. Each span is keyed by where it ends in the sentence.
 */
function keep(s: string): ReactNode {
  let end = 0;
  return s.split(/(\S+-\S+)/).map((p, i) => {
    end += p.length;
    return i % 2 ? (
      <span key={end} className="whitespace-nowrap">
        {p}
      </span>
    ) : (
      p
    );
  });
}

/**
 * The story's own gate, where 7B's gateOf names none: the frame's outlook lies past the story's release, so the
 * Thread draws its gate at that release (threadFrame's cap). A home story is scripted, so that gate is the story's
 * release, which its rows date ("Day 194 · Through the gate"): it is named in the release's own state, the heirs' or
 * the chosen wallet's. Null wherever gateOf names the gate itself.
 */
function storyGate(run: StageRun, axis: ScrubAxis, index: number, at: bigint): Gate | null {
  const end = run.moments.find((m) => m.kind === 'release');
  return end && !gateOf(run, axis, index, at, null) && threadFrame(run, axis, index, at, null).axis.releaseAt === end.at
    ? { at: end.at, state: end.state }
    : null;
}

/** The gate's label as scrubber.tsx draws it, in the track's box: under the arch, aside near the playhead. */
function GateAt({ gate, axis, at, words }: { gate: Gate | null; axis: ScrubAxis; at: bigint; words: GateWords }) {
  const gx = gate ? courseX(gate.at, axis) : 0;
  return gate && Math.abs(pctX(gx) - pctX(courseX(at, axis))) >= GATE_LABEL_NEAR ? (
    <span
      aria-hidden="true"
      data-part="gate-at"
      className="pointer-events-none absolute whitespace-nowrap font-mono text-caption text-ink-muted tabular-nums"
      style={{
        left: `${pctX(gx)}%`,
        top: `calc(${pctY(waveY(gx))}% + ${GATE_FOOT}% + 0.125rem)`,
        transform: `translateX(-${pctX(gx)}%)`,
      }}
    >
      {words(gate.at, gate.state)}
    </span>
  ) : null;
}

function StillThread({
  run,
  axis,
  index,
  at,
  gateLabel,
}: {
  run: StageRun;
  axis: ScrubAxis;
  index: number;
  at: bigint;
  gateLabel: GateWords;
}) {
  const frame = threadFrame(run, axis, index, at, null);
  const rings = momentRings(run, axis);
  return (
    <div data-testid="home-stage-still" className="@container flex min-w-0 flex-col">
      <div className={STILL_ROOT}>
        <div className={STILL_TRACK}>
          <Thread state={frame.state} axis={frame.axis} className={STILL_THREAD} />
          <span aria-hidden="true" data-layer="moments" className="pointer-events-none absolute inset-0">
            {rings.map((r) => (
              <span
                key={r.members.join('-')}
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-current bg-bg',
                  THREAD_COLOR[r.state],
                  r.knot ? 'size-3 border-[2.5px]' : 'size-2.5 border-2',
                  r.members.includes(index) && 'ring-2 ring-current/30',
                )}
                style={{ left: `${pctX(r.x)}%`, top: `${pctY(waveY(r.x))}%` }}
              />
            ))}
          </span>
          <GateAt gate={gateOf(run, axis, index, at, null)} axis={axis} at={at} words={gateLabel} />
        </div>
      </div>
    </div>
  );
}

function Switch({
  checked,
  disabled,
  dim,
  testId,
  onChange,
  children,
}: {
  checked: boolean;
  disabled: boolean;
  /** Dimmed as well: a switch that has no say in this story, not one waiting for the page to run. */
  dim: boolean;
  testId: string;
  onChange(on: boolean): void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        'group flex min-h-11 items-center gap-3 text-ink text-small',
        disabled ? 'cursor-default' : 'cursor-pointer',
        dim && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="peer sr-only"
      />
      <span aria-hidden="true" className={SWITCH}>
        <span className={KNOB} />
      </span>
      <span className="text-pretty">{children}</span>
    </label>
  );
}

/**
 * Scene 2 of the home page (spec §18.4.3 Task 6): one stage, two chips, two switches, six stories. Every frame is
 * the policy engine's: STAGE_RUNS, which sim.test.ts pins to scenarios() on the repository's netlist, until the reader
 * shows intent (useIntent), then the same stories computed in this browser, on 7B's Scrubber (R18.14). The controls
 * are disabled until the page runs; the rows jump to their day before the simulator loads too.
 */
export function HomeStage() {
  const t = useT(messages);
  const tl = useT(labels);
  const tw = useT(warnings);
  const { lang } = useLang();
  const mounted = useMounted();
  const id = useId();
  const hintId = `${id}-hint`;
  const listId = `${id}-list`;
  const scene = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { impl, phase, retry } = useStage(useIntent(scene, panel));

  const [chip, setChip] = useState<Chip>('inherit');
  const [confirm, setConfirm] = useState(true);
  const [back, setBack] = useState(false);
  // Seconds after the story's start; kept across stories, so two can be compared on the same day (as 7B does).
  const [offset, setOffset] = useState(0);

  const story = storyOf(chip, confirm, back);
  const run = (impl?.runs ?? STAGE_RUNS)[story];
  const axis = useMemo(() => scrubAxis(run), [run]);
  const beats = useMemo(() => beatsOf(run), [run]);
  const value = Math.min(Math.max(0, offset), axis.span);
  const at = axis.from + BigInt(value);
  const index = frameIndex(run, at);
  const state: ThreadState = run.moments[index].state;
  const beat = beatAt(beats, value);
  const vault = HOME_VAULT[chip];

  const words = {
    period: durationWords(seconds(PERIOD_DAYS), lang),
    silence: durationWords(seconds(INHERIT_DAYS.alarm), lang),
    window: durationWords(seconds(WINDOW_DAYS), lang),
  };
  const params = (b: Beat) => ({ ...words, k: vault.k, n: vault.n, missed: b.missed ?? 0 });
  const when = (b: Beat) => (b.until === null ? t('day', { day: b.day }) : t('days', { from: b.day, to: b.until }));
  const stamp = (b: Beat) => `${when(b)} · ${t(TITLE[b.key], params(b))}`;
  const say = (b: Beat) => t(SAY[b.key], params(b));
  const dayAt = (a: bigint) => dayOf(a - axis.from);
  const gateLabel = (a: bigint, s: ThreadState) =>
    t(s === 'recovery' || s === 'releasedRecover' ? 'gateWallet' : 'gateHeirs', { day: dayAt(a) });
  const about =
    chip === 'recover'
      ? tw('recoveryPower', { k: vault.k, n: vault.n, window: words.window })
      : t('aboutInherit', { ...words, k: vault.k, n: vault.n });
  const Scrubber = impl?.Scrubber ?? null;

  return (
    <Scene
      id="stage"
      ref={scene}
      stamp={<Stamp glyph="mark">{`${t('day', { day: beats[0].day })} · ${t('stampMake')}`}</Stamp>}
      title={t('title')}
      lead={t('lead')}
      attrs={{
        'data-testid': 'home-stage',
        'data-story': story,
        'data-state': state,
        'data-day': String(dayOf(value)),
        'data-engine': impl ? run.engine : 'prerender',
        'data-ready': READY[phase],
      }}
    >
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-x-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5 lg:col-start-1">
          <fieldset className="min-w-0">
            <legend className="mb-3 text-caption text-ink-muted">{t('storyLegend')}</legend>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <label key={c} className="stage-chip relative">
                  <input
                    type="radio"
                    name={`${id}-chip`}
                    value={c}
                    checked={chip === c}
                    disabled={!mounted}
                    onChange={() => setChip(c)}
                    className="sr-only"
                  />
                  <span className={CHIP_FACE}>{t(CHIP_KEY[c])}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="mb-2 text-caption text-ink-muted">{t('whatLegend')}</legend>
            <Switch
              testId="home-stage-confirm"
              checked={confirm && chip === 'inherit'}
              disabled={!mounted || chip !== 'inherit'}
              dim={chip !== 'inherit'}
              onChange={setConfirm}
            >
              {t('switchConfirm', { day: INHERIT_DAYS.confirm })}
            </Switch>
            <Switch testId="home-stage-back" checked={back} disabled={!mounted} dim={false} onChange={setBack}>
              {t('switchBack', { day: BACK_DAY[chip] })}
            </Switch>
          </fieldset>
        </div>

        {/* The panel: the frame's state and day, the thread, and the frame's stamp and sentence under it, so a
            sentence that wraps never moves the thread under a finger. Sticky beside the rows from 64rem. */}
        <div ref={panel} data-part="stage" className={PANEL}>
          <span aria-hidden="true" className={cn(GLOW, THREAD_COLOR[state])} />
          <div className="flex items-center justify-between gap-3">
            <StateBadge state={state} />
            <p data-testid="home-stage-day" className="voice-ledger text-ink text-title">
              {t('day', { day: dayOf(value) })}
            </p>
          </div>
          <div className="relative">
            {Scrubber ? (
              <Scrubber
                key={story}
                run={run}
                expiresAt={null}
                offset={value}
                onOffsetChange={setOffset}
                label={t('slider')}
                valueText={(a, _i, s) => t('valueText', { day: dayAt(a), state: tl(THREAD_STATE_KEY[s]) })}
                announce={(i) => {
                  const b = beatAt(beats, Number(run.moments[i].at - axis.from));
                  return `${stamp(b)}. ${say(b)}`;
                }}
                describedBy={hintId}
                playhead={(a) => t('day', { day: dayAt(a) })}
                gateLabel={gateLabel}
                testId="home-stage-scrubber"
              />
            ) : (
              <StillThread run={run} axis={axis} index={index} at={at} gateLabel={gateLabel} />
            )}
            {/* The story's gate, over whichever thread is drawn, in a copy of its track's box (STILL_*): it stands
                where the Scrubber's own label stands, before the load and after it (e2e). */}
            <div className="@container pointer-events-none absolute inset-x-0 top-0">
              <div className={STILL_ROOT}>
                <div className={STILL_TRACK}>
                  <div className={STILL_THREAD} />
                  <GateAt gate={storyGate(run, axis, index, at)} axis={axis} at={at} words={gateLabel} />
                </div>
              </div>
            </div>
          </div>
          <div data-testid="home-stage-caption" className="flex flex-col gap-1.5">
            <Stamp glyph={beat.glyph} tone={THREAD_COLOR[beat.state]}>
              {keep(stamp(beat))}
            </Stamp>
            <p className="text-balance text-ink text-lead">{keep(say(beat))}</p>
          </div>
          {/* Without its simulator the thread cannot be dragged: the hint keeps its place and says nothing. */}
          <p id={hintId} className={cn('text-pretty text-caption text-ink-muted', phase === 'failed' && 'invisible')}>
            {t('hint')}
            <span className="block text-balance pointer-coarse:sr-only"> {t('hintKeys')}</span>
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5 lg:col-start-1">
          <div className="flex flex-col gap-2">
            <h3 id={listId} className="font-display text-ink text-title">
              {t('listTitle')}
            </h3>
            <ol aria-labelledby={listId} data-testid="home-stage-beats" className="flex flex-col">
              {beats.map((b, i) => (
                <li key={`${b.key}:${b.offset}`}>
                  <button
                    type="button"
                    data-testid={`home-stage-beat-${i}`}
                    aria-current={b === beat ? 'step' : undefined}
                    data-ahead={b.offset > value ? '' : undefined}
                    disabled={!mounted}
                    onClick={() => setOffset(b.offset)}
                    className="stage-beat"
                  >
                    <Stamp glyph={b.glyph} tone={THREAD_COLOR[b.state]}>
                      {keep(stamp(b))}
                    </Stamp>
                    <span className="text-pretty text-small">{keep(say(b))}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <p data-testid="home-stage-about" className="text-pretty text-ink-muted text-small">
            {keep(about)}
          </p>
          {/* The three sources share one cell, so the footer never grows when the load ends, often more than
              500 ms after the input that asked for it: that would count as a layout shift. */}
          <div data-testid="home-stage-footer" className="grid text-caption text-ink-muted">
            {PHASES.map((p) => (
              <p key={p} className={cn('col-start-1 row-start-1 text-pretty', p !== phase && 'invisible')}>
                {t(FOOT[p])}
                {p === 'failed' ? (
                  <>
                    {' '}
                    <button type="button" onClick={retry} className={DOOR}>
                      {t('retry')}
                    </button>
                  </>
                ) : null}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Scene>
  );
}
