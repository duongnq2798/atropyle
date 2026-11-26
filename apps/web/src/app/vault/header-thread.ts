import type { Timeline, VaultConfig, VaultStatus } from '@atropyle/sdk';
import type { ThreadInput } from '@/thread/geometry';
import type { ThreadState } from '@/thread/state';

export interface HeaderThread {
  /** What the thread draws: the stored state, or what the rules allow now when nobody has acted on it yet. */
  state: ThreadState;
  /** status.pending differs from the stored state: the thread draws the pending one, dashed past "now". */
  predicted: boolean;
  input: ThreadInput;
}

/**
 * The axis starts this share of its span before the last check-in: "now" just after a check-in would stand at x = 0,
 * where the root's overflow-clip cuts it in half (7B T6 concern 3). The glow's beat reads the span to the alarm, so it
 * runs at most 1/32 faster.
 */
const LEAD = 32n;

const same = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/**
 * The vault header's thread (spec §18.4.2 T9): a linear axis from the last check-in to when the heirs (or the
 * recovery wallet) can receive, the vault's own wave, and its guardians at the gate. No check-in knots: the history
 * has its own axis. When the rules allow a state nobody has asked for (status.pending), the thread draws that state,
 * dashed; the badge and data-state keep the stored one.
 */
export function headerThread(
  config: Pick<VaultConfig, 'guardians' | 'k' | 'heirs'>,
  s: Pick<
    VaultStatus,
    | 'vault'
    | 'state'
    | 'pending'
    | 'expired'
    | 'lastAlive'
    | 'lateAt'
    | 'alarmAt'
    | 'windowEndsAt'
    | 'releasedAt'
    | 'expiresAt'
    | 'inhVoters'
    | 'recoveryTarget'
    | 'recVotes'
  >,
  timeline: Pick<Timeline, 'earliestRelease'>,
  now: bigint,
): HeaderThread {
  const predicted = !s.expired && s.pending !== s.state;
  const state: ThreadState = s.expired ? 'expired' : predicted ? s.pending : s.state;
  // When the alarm was raised, or when the rules allow it: the end of the lit part, the start of the fray.
  const alarmAt = s.alarmAt ?? s.lateAt;
  // The gate: the release that happened, or the earliest the engine finds if nobody signs anything.
  const releaseAt = s.releasedAt ?? timeline.earliestRelease ?? s.windowEndsAt;
  const end = releaseAt ?? s.expiresAt ?? (now > alarmAt ? now : alarmAt);
  const span = end - s.lastAlive;
  const from = s.lastAlive - (span > 0n ? span / LEAD : 0n);
  const to = end > from ? end : from + 1n;
  const recovery = state === 'recovery' || state === 'releasedRecover';
  // inhVotes is a bitmask; inhVoters is the list. In a recovery a post stands for a vote for this very wallet.
  const lit = recovery ? s.recVotes.filter((v) => same(v.target, s.recoveryTarget)).length : s.inhVoters.length;
  return {
    state,
    predicted,
    input: {
      axis: { from, to, now, alarmAt, releaseAt },
      predicted,
      signature: s.vault,
      posts: { n: config.guardians.length, k: config.k, lit },
      branches: config.heirs.map((h) => h.bps),
    },
  };
}
