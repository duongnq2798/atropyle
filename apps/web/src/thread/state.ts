import type { StateName, VaultStatus } from '@atropyle/sdk';
import type { GlyphName } from './glyphs';

/** The five vault states plus an expired Drill (spec §4.1). */
export type ThreadState = StateName | 'expired';

export const THREAD_STATES: readonly ThreadState[] = [
  'active',
  'grace',
  'recovery',
  'releasedInherit',
  'releasedRecover',
  'expired',
];

export function threadStateOf(s: Pick<VaultStatus, 'state' | 'expired'>): ThreadState {
  return s.expired ? 'expired' : s.state;
}

function fraction(left: bigint, span: bigint): number {
  if (span <= 0n || left <= 0n) return 0;
  if (left >= span) return 1;
  return Number((left * 10_000n) / span) / 10_000;
}

/**
 * Share of the thread still lit, 0–1. While an alarm runs it is the response window; otherwise the time until the
 * owner is late. Released and expired vaults have nothing left. `now` is chain time (chainNow of lib/format).
 */
export function threadRemaining(
  s: Pick<VaultStatus, 'state' | 'expired' | 'lastAlive' | 'lateAt' | 'alarmAt' | 'windowEndsAt'>,
  now: bigint,
): number {
  if (s.expired || s.state === 'releasedInherit' || s.state === 'releasedRecover') return 0;
  if (s.alarmAt !== null && s.windowEndsAt !== null) return fraction(s.windowEndsAt - now, s.windowEndsAt - s.alarmAt);
  return fraction(s.lateAt - now, s.lateAt - s.lastAlive);
}

/** The Thread is gold while alive (spec §4.1); the badge uses `alive` (spec §4.3). */
export const THREAD_COLOR: Record<ThreadState, string> = {
  active: 'text-thread',
  grace: 'text-grace',
  recovery: 'text-recovery',
  releasedInherit: 'text-release',
  releasedRecover: 'text-release',
  expired: 'text-ink-muted',
};

export const BADGE_COLOR: Record<ThreadState, string> = {
  active: 'border-alive/40 bg-alive/10 text-alive',
  grace: 'border-grace/40 bg-grace/10 text-grace',
  recovery: 'border-recovery/40 bg-recovery/10 text-recovery',
  releasedInherit: 'border-release/40 bg-release/10 text-release',
  releasedRecover: 'border-release/40 bg-release/10 text-release',
  expired: 'border-line-strong bg-surface-2 text-ink-muted',
};

export const STATE_GLYPH: Record<ThreadState, GlyphName> = {
  active: 'active',
  grace: 'grace',
  recovery: 'recovery',
  releasedInherit: 'releasedInherit',
  releasedRecover: 'releasedRecover',
  expired: 'expired',
};
