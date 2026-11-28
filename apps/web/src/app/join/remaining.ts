import type { VaultStatus } from '@atropyle/sdk';

/*
 * A local copy of threadRemaining (src/thread/state.ts). state.ts sits in the shell chunk, and threadRemaining has no
 * other caller, so the build leaves it out; importing it here would put it back into the chunk every page loads
 * (as failedEmpty did in 7C T8). join-page.test.tsx holds the two equal.
 */
function fraction(left: bigint, span: bigint): number {
  if (span <= 0n || left <= 0n) return 0;
  if (left >= span) return 1;
  return Number((left * 10_000n) / span) / 10_000;
}

/** Share of the vault's thread still lit at chain time `now`, 0–1: the response window during an alarm, else the time until the owner is late. */
export function remainingAt(
  s: Pick<VaultStatus, 'state' | 'expired' | 'lastAlive' | 'lateAt' | 'alarmAt' | 'windowEndsAt'>,
  now: bigint,
): number {
  if (s.expired || s.state === 'releasedInherit' || s.state === 'releasedRecover') return 0;
  if (s.alarmAt !== null && s.windowEndsAt !== null) return fraction(s.windowEndsAt - now, s.windowEndsAt - s.alarmAt);
  return fraction(s.lateAt - now, s.lateAt - s.lastAlive);
}
