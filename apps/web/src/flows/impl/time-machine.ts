import {
  applyAction,
  computeTimeline,
  deriveInputs,
  type EngineKind,
  type EvalState,
  isReleasedState,
  OUT_FLAGS,
  type PolicyEngine,
  STATE_CODES,
  type StateName,
  stateName,
  type TimelineEvent,
  type VaultAction,
} from '@atropyle/sdk';
import { type Address, getAddress } from 'viem';

// The frame lookups have no SDK and live with the UI, which calls them on every render; the plan's callers import
// them from here. Nothing in this module comes from ./index (one loading path: src/flows/time-machine/load.ts).
export { frameAt, frameIndex } from '../time-machine/frame';

export type ScenarioId = 'silent' | 'confirm' | 'recover' | 'returns' | 'recoverBlocked';
export type MomentKind = 'now' | 'attest' | 'vote' | 'checkIn' | TimelineEvent['kind'];

export interface Moment {
  at: bigint;
  /** The policy state right after this moment. */
  state: StateName;
  kind: MomentKind;
  /** Who signs at this moment: the guardian (attest, vote) or the owner (checkIn); null for a poke. */
  who: Address | null;
  /**
   * If nobody signs anything after this moment: when the alarm goes off (active) or went off (grace, recovery).
   * Null when none comes before a Drill ends, and once released.
   */
  alarmAt: bigint | null;
  /** If nobody signs anything after this moment: when the vault releases; once released, when it did. */
  releaseAt: bigint | null;
}

export interface ScenarioRun {
  id: ScenarioId;
  /** In time order; the first is now. */
  moments: Moment[];
  /**
   * The end of the story: one period after the last change, or the Drill's end if that comes first. A Drill that
   * ends before anything releases ends there, and its last moment is the Drill's end.
   */
  end: bigint;
  engine: EngineKind;
}

/**
 * When the signed steps happen, as absolute chain times like `now`. A time earlier than the step can be moves to the
 * earliest it can be: a confirmation after the alarm, a vote after now and after the vote before it, a return after
 * the alarm, a block after the last vote.
 */
export interface ScenarioOptions {
  /** The first confirmation; the next ones follow one second apart. Default: one second after the alarm. */
  confirmAt?: bigint;
  /** Each recovery vote, in guardian order. Default: one second after now, then one second apart. */
  votesAt?: readonly bigint[];
  /**
   * The owner's check-in of `returns`; only the confirmations before it happen. Default: the alarm plus half the
   * alarm window, which always falls inside the window.
   */
  returnAt?: bigint;
  /** The owner's check-in of `recoverBlocked`. Default: one second after the last vote. */
  blockAt?: bigint;
}

/** The wallet the recovery scenarios vote for: an illustration, never shown and never offered as a real target. */
export const NEW_WALLET: Address = getAddress(`0x${'7e'.repeat(20)}`);

const ATTEST: VaultAction = { type: 'attestDeath', on: true };
const CHECK_IN: VaultAction = { type: 'checkIn' };
const VOTE: VaultAction = { type: 'voteRecovery', target: NEW_WALLET };

const latest = (a: bigint, b: bigint): bigint => (a > b ? a : b);

function popcount(x: number): number {
  let n = 0;
  for (let v = x; v !== 0; v &= v - 1) n++;
  return n;
}

function withFlags(s: EvalState, r: { next: number; out: number }, at: bigint, candidate: Address | null): EvalState {
  const next: EvalState = { ...s, state: r.next };
  if (r.out & OUT_FLAGS.alarm) {
    next.alarmAt = at;
    next.recoveryTarget = r.next === STATE_CODES.recovery ? candidate : null;
  }
  if (r.out & OUT_FLAGS.cancel) {
    next.alarmAt = 0n;
    next.recoveryTarget = null;
  }
  return next;
}

/** A signed action and the policy step it triggers, as the vault runs it (the same rules as predictAction). */
function act(
  e: PolicyEngine,
  s: EvalState,
  action: VaultAction,
  as: Address,
  at: bigint,
  drill: boolean,
): EvalState | null {
  const applied = applyAction(s, action, as, at, drill);
  if (!applied) return null;
  const r = e.step(s.state, deriveInputs(applied.next, at, { alive: applied.alive, candidate: applied.candidate }));
  const candidate = s.state === STATE_CODES.recovery ? s.recoveryTarget : applied.candidate;
  return withFlags(applied.next, r, at, candidate);
}

/** Anyone pokes at `at`: the step the silent timeline predicts there. */
function poke(e: PolicyEngine, s: EvalState, at: bigint): EvalState {
  return withFlags(s, e.step(s.state, deriveInputs(s, at)), at, s.recoveryTarget);
}

interface Step {
  at: bigint;
  action: VaultAction;
  as: Address;
  kind: 'attest' | 'vote' | 'checkIn';
}

/** A story being told: the state after its last moment. */
interface Story {
  s: EvalState;
  at: bigint;
  moments: Moment[];
  /** When the vault released in this story, once it has. */
  releasedAt: bigint | null;
}

/** What the state leads to if nobody signs anything after `at`. */
function outlook(
  e: PolicyEngine,
  s: EvalState,
  at: bigint,
  expiresAt: bigint | null,
  releasedAt: bigint | null,
): Pick<Moment, 'alarmAt' | 'releaseAt'> {
  const name = stateName(s.state);
  if (isReleasedState(name)) return { alarmAt: null, releaseAt: releasedAt };
  const tl = computeTimeline(e, s, at, expiresAt);
  const raised = s.alarmAt === 0n ? null : s.alarmAt;
  return {
    alarmAt: name === 'active' ? (tl.events.find((x) => x.kind === 'alarm')?.at ?? null) : raised,
    releaseAt: tl.earliestRelease,
  };
}

function record(e: PolicyEngine, story: Story, kind: MomentKind, who: Address | null, expiresAt: bigint | null) {
  const state = stateName(story.s.state);
  if (story.releasedAt === null && isReleasedState(state)) story.releasedAt = story.at;
  story.moments.push({ at: story.at, state, kind, who, ...outlook(e, story.s, story.at, expiresAt, story.releasedAt) });
}

/** Pokes every change the silent timeline predicts before `until` (every one, with null). */
function advance(e: PolicyEngine, story: Story, until: bigint | null, expiresAt: bigint | null): void {
  // No story has more than three changes in a row; the guard only stops a broken engine from looping.
  for (let guard = 0; guard < 8; guard++) {
    const next = computeTimeline(e, story.s, story.at, expiresAt).events.find((x) => x.kind !== 'drillExpiry');
    if (!next || (until !== null && next.at >= until)) return;
    story.s = poke(e, story.s, next.at);
    story.at = next.at;
    record(e, story, next.kind, null, expiresAt);
  }
}

/**
 * The steps in time order, each after the pokes that come before it, then silence. Null when a step cannot happen
 * (the vault released or the Drill ended first, or the vault would revert it): a half story under a chip would be false.
 */
function play(
  e: PolicyEngine,
  s: EvalState,
  now: bigint,
  expiresAt: bigint | null,
  drill: boolean,
  steps: readonly Step[],
): Story | null {
  const story: Story = { s, at: now, moments: [], releasedAt: null };
  record(e, story, 'now', null, expiresAt);
  for (const step of steps) {
    advance(e, story, step.at, expiresAt);
    if (isReleasedState(stateName(story.s.state)) || (expiresAt !== null && step.at >= expiresAt)) return null;
    const next = act(e, story.s, step.action, step.as, step.at, drill);
    if (!next) return null;
    story.s = next;
    story.at = step.at;
    record(e, story, step.kind, step.as, expiresAt);
  }
  advance(e, story, null, expiresAt);
  return story;
}

function finish(id: ScenarioId, e: PolicyEngine, story: Story, expiresAt: bigint | null): ScenarioRun {
  const last = story.moments[story.moments.length - 1];
  const padded = last.at + BigInt(story.s.timing.period);
  const end = expiresAt !== null && (expiresAt < padded || story.releasedAt === null) ? expiresAt : padded;
  const moments = [...story.moments];
  if (expiresAt !== null && expiresAt <= end) moments.push({ ...last, at: expiresAt, kind: 'drillExpiry', who: null });
  return { id, engine: e.kind, moments, end };
}

/**
 * What the vault's own rules do from `now` (spec §4.6.2), every frame from the policy engine (the on-chain netlist,
 * or the reference model on a devnet), never from a drawing:
 * - `silent`: the owner never signs again;
 * - `confirm`: the guardians who have not confirmed yet confirm the alarm;
 * - `recover`: the first k guardians vote for NEW_WALLET;
 * - `returns`: as `confirm` until the owner checks in at `returnAt`, then silence;
 * - `recoverBlocked`: the votes, then the owner checks in at `blockAt`, then silence.
 * Only what the vault allows is offered; without options the first three are the plan's numbers.
 */
export function scenarios(
  engine: PolicyEngine,
  s: EvalState,
  now: bigint,
  expiresAt: bigint | null,
  drill: boolean,
  opts: ScenarioOptions = {},
): ScenarioRun[] {
  const first = stateName(s.state);
  const closed = isReleasedState(first) || (expiresAt !== null && now >= expiresAt);
  const silent = closed ? null : play(engine, s, now, expiresAt, drill, []);
  if (!silent) {
    const only: Moment = {
      at: now,
      state: first,
      kind: 'now',
      who: null,
      alarmAt: s.alarmAt === 0n ? null : s.alarmAt,
      releaseAt: null,
    };
    return [{ id: 'silent', engine: engine.kind, moments: [only], end: now }];
  }
  const runs: ScenarioRun[] = [finish('silent', engine, silent, expiresAt)];
  const enough = s.k > 0 && s.guardians.length >= s.k;
  const open = first === 'active' || first === 'grace';
  // The alarm the confirmations answer: the one already raised, or the one silence brings.
  const raised =
    first === 'grace'
      ? s.alarmAt
      : first === 'active'
        ? (runs[0].moments.find((m) => m.kind === 'alarm')?.at ?? null)
        : null;
  const after = raised === null ? null : latest(raised, now);

  let confirmSteps: Step[] | null = null;
  const missing = s.k - popcount(s.inhVotes & ((1 << s.guardians.length) - 1));
  const confirmers = s.guardians.filter((_, i) => (s.inhVotes & (1 << i)) === 0).slice(0, Math.max(0, missing));
  if (enough && open && after !== null && missing > 0 && confirmers.length === missing) {
    const from = latest(opts.confirmAt ?? after + 1n, after + 1n);
    const steps = confirmers.map((g, i): Step => ({ at: from + BigInt(i), action: ATTEST, as: g, kind: 'attest' }));
    const story = play(engine, s, now, expiresAt, drill, steps);
    if (story) {
      runs.push(finish('confirm', engine, story, expiresAt));
      confirmSteps = steps;
    }
  }

  let voteSteps: Step[] | null = null;
  if (enough && open && s.recoveryEnabled) {
    let prev = now;
    const steps = s.guardians.slice(0, s.k).map((g, i): Step => {
      prev = latest(opts.votesAt?.[i] ?? prev + 1n, prev + 1n);
      return { at: prev, action: VOTE, as: g, kind: 'vote' };
    });
    const story = play(engine, s, now, expiresAt, drill, steps);
    if (story) {
      runs.push(finish('recover', engine, story, expiresAt));
      voteSteps = steps;
    }
  }

  if (confirmSteps && raised !== null && after !== null) {
    const back = latest(opts.returnAt ?? raised + BigInt(s.timing.window) / 2n, after + 1n);
    const steps: Step[] = [
      ...confirmSteps.filter((x) => x.at < back),
      { at: back, action: CHECK_IN, as: s.owner, kind: 'checkIn' },
    ];
    const story = play(engine, s, now, expiresAt, drill, steps);
    if (story) runs.push(finish('returns', engine, story, expiresAt));
  }

  if (voteSteps) {
    const last = voteSteps[voteSteps.length - 1].at;
    const steps: Step[] = [
      ...voteSteps,
      { at: latest(opts.blockAt ?? last + 1n, last + 1n), action: CHECK_IN, as: s.owner, kind: 'checkIn' },
    ];
    const story = play(engine, s, now, expiresAt, drill, steps);
    if (story) runs.push(finish('recoverBlocked', engine, story, expiresAt));
  }
  return runs;
}
