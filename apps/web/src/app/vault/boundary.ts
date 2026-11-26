import type { VaultStatus } from '@atropyle/sdk';
import type { LoadedVault } from '@/chain/types';
import { chainNow } from '@/lib/format';

/** The vault's normal pace (useVault). */
export const NORMAL_MS = 30_000;
/** After a moment, the block that carries it must exist: X Layer makes one a second, and 1.5 s leaves room. */
export const AFTER_MS = 1_500;
/** Never two reads closer than this. */
export const MIN_MS = 1_000;

export type BoundaryStatus = Pick<VaultStatus, 'lateAt' | 'alarmAt' | 'windowEndsAt' | 'expiresAt'>;

/**
 * The nearest moment after `now` at which the rules may change what a poke does (spec §18.4.2 T9): the owner is
 * late, an alarm, the end of the window, the Drill's expiry, and any `more` (the 15-period fallback, from the
 * timeline). Chain time, in seconds.
 */
export function nextBoundary(status: BoundaryStatus, now: bigint, more: readonly (bigint | null)[] = []): bigint | null {
  let next: bigint | null = null;
  for (const t of [status.lateAt, status.alarmAt, status.windowEndsAt, status.expiresAt, ...more]) {
    if (t !== null && t > now && (next === null || t < next)) next = t;
  }
  return next;
}

/** Milliseconds to the next read: AFTER_MS past the boundary, clamped to [MIN_MS, normal]. */
export function refetchDelay(boundary: bigint | null, now: bigint, normal: number = NORMAL_MS): number {
  if (boundary === null) return normal;
  const ms = Number(boundary - now) * 1000 + AFTER_MS;
  return Math.min(normal, Math.max(MIN_MS, ms));
}

/**
 * useVault's refetchMs for the vault page: the vault is read again just after the next boundary, so a page left open
 * sees "the rules now allow the alarm" within seconds instead of within 30 s.
 */
export function vaultRefetchMs(loaded: LoadedVault, nowMs: number): number {
  const s = loaded.snap.status;
  const now = chainNow(s.blockTimestamp, loaded.fetchedAtMs, nowMs);
  return refetchDelay(nextBoundary(s, now, [loaded.timeline?.milestones.maxedAt ?? null]), now);
}
