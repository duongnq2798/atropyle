import type { TimeMachineImpl } from '@/flows/time-machine/load';
import type { GlyphName } from '@/thread/glyphs';
import { STATE_GLYPH, type ThreadState } from '@/thread/state';

// The stage's stories without the SDK: the numbers and the six runs its first paint shows. Their types come from the
// time machine through load.ts (R18.14): no file of src/home imports flows/impl/time-machine, even as a type.
type Scenarios = TimeMachineImpl['scenarios'];
/** One story: a run of scenarios() (flows/impl/time-machine.ts). */
export type StageRun = ReturnType<Scenarios>[number];
export type StageMoment = StageRun['moments'][number];
export type StageOptions = NonNullable<Parameters<Scenarios>[5]>;
type Address = NonNullable<StageMoment['who']>;

export const DAY = 86_400n;
const DAY_SECONDS = Number(DAY);

/**
 * PRESETS.sixMonths (packages/sdk/src/plan/types.ts) in days: a check-in every 30, the alarm after 6 missed (day 180),
 * and an alarm window of 14. sim.test.ts holds each to the SDK.
 */
export const PERIOD_DAYS = 30;
export const WINDOW_DAYS = 14;
/**
 * The inheritance stories: the alarm, the confirmation and the return of the spec, the gate with a confirmation
 * (exitTimes' heirs route) and without one (heirsFallback), and the same two after the return on day 187.
 */
export const INHERIT_DAYS = {
  alarm: 180,
  confirm: 183,
  back: 187,
  release: 194,
  fallback: 450,
  nextAlarm: 367,
  nextFallback: 637,
} as const;
/** The recovery stories: two votes, the owner's check-in that blocks them, the gate W after the second vote. */
export const RECOVER_DAYS = {
  vote1: 10,
  vote2: 12,
  block: 20,
  release: 26,
  nextAlarm: 200,
  nextFallback: 470,
} as const;

const d = (days: number): bigint => BigInt(days) * DAY;

/** Spec §18.4.3 Task 6: when each signed step happens. */
export const HOME_OPTIONS = {
  confirmAt: d(INHERIT_DAYS.confirm),
  returnAt: d(INHERIT_DAYS.back),
  votesAt: [d(RECOVER_DAYS.vote1), d(RECOVER_DAYS.vote2)],
  blockAt: d(RECOVER_DAYS.block),
} as const satisfies StageOptions;
/**
 * "I come back" with no confirmation: scenarios() keeps only the confirmations before returnAt, so one asked for the
 * day after the return never happens.
 */
export const LATE_OPTIONS = { ...HOME_OPTIONS, confirmAt: d(INHERIT_DAYS.back + 1) } as const satisfies StageOptions;

/** The people of the stories: placeholders, the same as impl/hero-states.ts's HERO_BASE (sim.test.ts holds it). */
export const HOME_PEOPLE = {
  owner: '0x1111111111111111111111111111111111111111',
  g1: '0x2222222222222222222222222222222222222222',
  g2: '0x3333333333333333333333333333333333333333',
  g3: '0x6666666666666666666666666666666666666666',
} as const satisfies Record<string, Address>;

/** k of n of each story's vault: the hero's for inheritance, 2 of 3 for recovery (impl/stage.ts's RECOVER_BASE). */
export const HOME_VAULT = { inherit: { k: 1, n: 2 }, recover: { k: 2, n: 3 } } as const;

export type Chip = keyof typeof HOME_VAULT;
export type StoryId = 'silent' | 'confirm' | 'back' | 'confirmBack' | 'recover' | 'recoverBack';
export const STORY_IDS: readonly StoryId[] = ['silent', 'confirm', 'back', 'confirmBack', 'recover', 'recoverBack'];
export type StageRuns = Readonly<Record<StoryId, StageRun>>;

/** The story the chips and the switches tell. Under Recovery the confirmation switch has no say. */
export function storyOf(chip: Chip, confirm: boolean, back: boolean): StoryId {
  if (chip === 'recover') return back ? 'recoverBack' : 'recover';
  if (confirm) return back ? 'confirmBack' : 'confirm';
  return back ? 'back' : 'silent';
}

/** A moment in days: [day, kind, state, alarm day, gate day, who]. */
type Row = readonly [
  day: number,
  kind: StageMoment['kind'],
  state: StageMoment['state'],
  alarm: number | null,
  gate: number | null,
  who?: Address,
];
function story(id: StageRun['id'], end: number, rows: readonly Row[]): StageRun {
  return {
    id,
    engine: 'netlist',
    end: d(end),
    moments: rows.map(([day, kind, state, alarm, gate, who]) => ({
      at: d(day),
      state,
      kind,
      who: who ?? null,
      alarmAt: alarm === null ? null : d(alarm),
      releaseAt: gate === null ? null : d(gate),
    })),
  };
}

const I = INHERIT_DAYS;
const R = RECOVER_DAYS;
const P = HOME_PEOPLE;
const START: Row = [0, 'now', 'active', I.alarm, I.fallback];
const ALARM: Row = [I.alarm, 'alarm', 'grace', I.alarm, I.fallback];
const CONFIRM: Row = [I.confirm, 'attest', 'grace', I.alarm, I.release, P.g1];
const AFTER_BACK: readonly Row[] = [
  [I.back, 'checkIn', 'active', I.nextAlarm, I.nextFallback, P.owner],
  [I.nextAlarm, 'alarm', 'grace', I.nextAlarm, I.nextFallback],
  [I.nextFallback, 'release', 'releasedInherit', null, I.nextFallback],
];
const VOTES: readonly Row[] = [
  [R.vote1, 'vote', 'active', I.alarm, I.fallback, P.g1],
  [R.vote2, 'vote', 'recovery', R.vote2, R.release, P.g2],
];

/**
 * What impl/stage.ts's homeRuns() computes with HOME_OPTIONS (sim.test.ts holds the two equal, on the netlist and
 * on the reference model): the first paint, before the SDK loads, and what a reader without JavaScript reads. A story
 * ends one period after its last change, as scenarios() ends it.
 */
export const STAGE_RUNS: StageRuns = {
  silent: story('silent', I.fallback + PERIOD_DAYS, [
    START,
    ALARM,
    [I.fallback, 'release', 'releasedInherit', null, I.fallback],
  ]),
  confirm: story('confirm', I.release + PERIOD_DAYS, [
    START,
    ALARM,
    CONFIRM,
    [I.release, 'release', 'releasedInherit', null, I.release],
  ]),
  confirmBack: story('returns', I.nextFallback + PERIOD_DAYS, [START, ALARM, CONFIRM, ...AFTER_BACK]),
  back: story('returns', I.nextFallback + PERIOD_DAYS, [START, ALARM, ...AFTER_BACK]),
  recover: story('recover', R.release + PERIOD_DAYS, [
    START,
    ...VOTES,
    [R.release, 'release', 'releasedRecover', null, R.release],
  ]),
  recoverBack: story('recoverBlocked', R.nextFallback + PERIOD_DAYS, [
    START,
    ...VOTES,
    [R.block, 'checkIn', 'active', R.nextAlarm, R.nextFallback, P.owner],
    [R.nextAlarm, 'alarm', 'grace', R.nextAlarm, R.nextFallback],
    [R.nextFallback, 'release', 'releasedInherit', null, R.nextFallback],
  ]),
};

/** Whole days since a story's start. */
export function dayOf(seconds: bigint | number): number {
  return Math.floor(Number(seconds) / DAY_SECONDS);
}

export type BeatKey =
  | 'start'
  | 'quiet'
  | 'alarm'
  | 'confirm'
  | 'back'
  | 'backRecovery'
  | 'vote'
  | 'voteEnough'
  | 'gate'
  | 'gateFallback'
  | 'gateRecover';

/** A dated row of the stage: one moment, or the quiet stretch before an alarm. */
export interface Beat {
  key: BeatKey;
  /** Where its row jumps to, in seconds after the story's start (the Scrubber's offset). */
  offset: number;
  /** Its first day, and the last of a quiet stretch (null for one day). */
  day: number;
  until: number | null;
  state: ThreadState;
  glyph: GlyphName;
  /** For gateFallback: the periods since the last check-in, without one. */
  missed: number | null;
}

/** A check-in ties the owner's knot; the start is the product's mark (spec §4.1); the rest wear their state. */
const KIND_GLYPH: Partial<Record<StageMoment['kind'], GlyphName>> = { now: 'mark', checkIn: 'knot' };

/** The row of a moment, read by what it changes; null for a moment the home stories never have (a Drill's end). */
function keyOf(m: StageMoment, prev: StageMoment | null, confirmed: boolean): BeatKey | null {
  switch (m.kind) {
    case 'now':
      return 'start';
    case 'alarm':
      return 'alarm';
    case 'attest':
      return 'confirm';
    case 'vote':
      return m.state === 'recovery' && prev?.state !== 'recovery' ? 'voteEnough' : 'vote';
    case 'checkIn':
      return prev?.state === 'recovery' ? 'backRecovery' : 'back';
    case 'release':
      if (m.state === 'releasedRecover') return 'gateRecover';
      return confirmed ? 'gate' : 'gateFallback';
    default:
      return null;
  }
}

/**
 * A story as dated rows: each moment, and before an alarm that comes more than a day after the moment before it, the
 * quiet stretch in between ("Days 1–179"). A release is the heirs' gate with a confirmation since the last check-in,
 * else the fallback after `missed` periods.
 */
export function beatsOf(run: StageRun): Beat[] {
  const from = run.moments[0].at;
  const out: Beat[] = [];
  let alive = from;
  let confirmed = false;
  for (let i = 0; i < run.moments.length; i++) {
    const m = run.moments[i];
    const prev = i > 0 ? run.moments[i - 1] : null;
    if (m.kind === 'alarm' && prev !== null && m.at - prev.at > DAY) {
      const first = prev.at + DAY;
      out.push({
        key: 'quiet',
        offset: Number(first - from),
        day: dayOf(first - from),
        until: dayOf(m.at - DAY - from),
        state: prev.state,
        glyph: STATE_GLYPH[prev.state],
        missed: null,
      });
    }
    const key = keyOf(m, prev, confirmed);
    if (key !== null) {
      out.push({
        key,
        offset: Number(m.at - from),
        day: dayOf(m.at - from),
        until: null,
        state: m.state,
        glyph: KIND_GLYPH[m.kind] ?? STATE_GLYPH[m.state],
        missed: key === 'gateFallback' ? Math.round(Number(m.at - alive) / (PERIOD_DAYS * DAY_SECONDS)) : null,
      });
    }
    if (m.kind === 'attest') confirmed = true;
    if (m.kind === 'now' || m.kind === 'checkIn') {
      alive = m.at;
      confirmed = false;
    }
  }
  return out;
}

/** The row the playhead stands in at `offset` seconds: the last one that starts at or before it. */
export function beatAt(beats: readonly Beat[], offset: number): Beat {
  let found = beats[0];
  for (const b of beats) if (b.offset <= offset) found = b;
  return found;
}
