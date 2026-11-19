import { popcount } from '@atropyle/circuits';
import { formatDuration } from '../duration';
import type { VaultSnapshot } from '../read/types';
import { isReleasedState, OUT_FLAGS, STATE_CODES, type StateName, stateName } from '../types';
import type { EngineKind, PolicyEngine } from './engine';
import { deriveInputs, type EvalState, evalStateOf } from './inputs';

export type TimelineEventKind = 'alarm' | 'release' | 'drillExpiry';

export interface TimelineEvent {
  at: bigint;
  kind: TimelineEventKind;
  from: StateName;
  state: StateName;
  note: string;
}

export interface Timeline {
  now: bigint;
  engine: EngineKind;
  milestones: { lateAt: bigint; maxedAt: bigint; windowEndsAt: bigint | null; expiresAt: bigint | null };
  /** What happens if nobody signs anything and someone other than the owner pokes at each moment. */
  events: TimelineEvent[];
  earliestRelease: bigint | null;
  /** Next policy transition (not drill expiry); what a keeper schedules on. */
  nextCheckAt: bigint | null;
}

const released = (code: number) => isReleasedState(stateName(code));

function note(kind: TimelineEventKind, to: StateName, s: EvalState, viaFallback: boolean): string {
  if (kind === 'alarm') {
    return `Alarm: ${s.timing.threshold} check-ins missed. Heirs and guardians are alerted; the owner can still cancel by checking in during the ${formatDuration(s.timing.window)} window.`;
  }
  if (to === 'releasedRecover')
    return 'Release to the recovery wallet. Anyone (for example the keeper) can then call distribute.';
  if (viaFallback) {
    return 'Release to heirs through the 15-period fallback: after 15 missed periods no guardian confirmation is needed. Anyone can then call distribute.';
  }
  return 'Release to heirs. Anyone (for example the keeper) can then call distribute.';
}

export function computeTimeline(engine: PolicyEngine, s: EvalState, now: bigint, expiresAt: bigint | null): Timeline {
  const P = BigInt(s.timing.period);
  const W = BigInt(s.timing.window);
  const lateAt = s.lastAlive + BigInt(s.timing.threshold) * P;
  const maxedAt = s.lastAlive + 15n * P;
  const events: TimelineEvent[] = [];
  const result = (): Timeline => ({
    now,
    engine: engine.kind,
    milestones: { lateAt, maxedAt, windowEndsAt: s.alarmAt === 0n ? null : s.alarmAt + W, expiresAt },
    events,
    earliestRelease: events.find((e) => e.kind === 'release')?.at ?? null,
    nextCheckAt: events.find((e) => e.kind !== 'drillExpiry')?.at ?? null,
  });
  // An expired Drill reverts every call: nothing can happen any more.
  if (expiresAt !== null && now >= expiresAt) return result();

  let cur = s;
  let t = now;
  for (let guard = 0; guard < 6 && !released(cur.state); guard++) {
    const points = [t, lateAt, maxedAt];
    if (cur.alarmAt !== 0n) points.push(cur.alarmAt + W);
    const candidates = [...new Set(points.filter((x) => x >= t))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    let hit: { at: bigint; next: number; out: number } | null = null;
    for (const c of candidates) {
      if (expiresAt !== null && c >= expiresAt) break;
      const r = engine.step(cur.state, deriveInputs(cur, c));
      if (r.next !== cur.state) {
        hit = { at: c, ...r };
        break;
      }
    }
    if (!hit) break;
    const kind: TimelineEventKind = hit.out & OUT_FLAGS.release ? 'release' : 'alarm';
    const to = stateName(hit.next);
    const viaFallback = kind === 'release' && to === 'releasedInherit' && cur.k > 0 && popcount(cur.inhVotes) < cur.k;
    events.push({ at: hit.at, kind, from: stateName(cur.state), state: to, note: note(kind, to, cur, viaFallback) });
    const next: EvalState = { ...cur, state: hit.next };
    if (hit.out & OUT_FLAGS.alarm) {
      next.alarmAt = hit.at;
      next.recoveryTarget = hit.next === STATE_CODES.recovery ? cur.recoveryTarget : null;
    }
    if (hit.out & OUT_FLAGS.cancel) {
      next.alarmAt = 0n;
      next.recoveryTarget = null;
    }
    cur = next;
    t = hit.at;
  }
  // Also after a release: distribute() has a notExpired guard, so payouts stop at expiresAt.
  if (expiresAt !== null) {
    const st = stateName(cur.state);
    events.push({
      at: expiresAt,
      kind: 'drillExpiry',
      from: st,
      state: st,
      note: 'The Drill expires: no further check-ins, votes, pokes or distributions are possible.',
    });
  }
  return result();
}

export function timelineOf(engine: PolicyEngine, snap: VaultSnapshot, now?: bigint): Timeline {
  return computeTimeline(engine, evalStateOf(snap), now ?? snap.status.blockTimestamp, snap.status.expiresAt);
}
