import { computeTimeline, evalStateOf, type PolicyEngine, STATE_CODES, type VaultSnapshot } from '@atropyle/sdk';
import { KEEPER_CADENCE_S } from '@/config/facts';

/**
 * What the check-in ritual says about a Drill's own time (R18.11), in whole minutes: `a` and `b` are the rules' own
 * (the time machine's "Heirs receive" for the same vault), `keeper` what the keeper's rounds add to them.
 */
export type RitualDrill =
  | { kind: 'simple'; a: number; keeper: number }
  | { kind: 'guarded'; a: number; b: number; k: number; n: number; keeper: number }
  | { kind: 'guardedOnly'; a: number; k: number; n: number; keeper: number }
  | { kind: 'expires' };

/**
 * Two pokes stand between a silent owner and the heirs (the alarm, then the release); the keeper sends each within
 * one round. Said apart from the rules' minutes, so the ritual and the time machine name the same moment alike.
 */
export const KEEPER_MINUTES = Math.ceil((2 * KEEPER_CADENCE_S) / 60);

function minutes(at: bigint | null, now: bigint): number | null {
  return at === null ? null : Math.ceil(Number(at - now) / 60);
}

/**
 * A check-in now, then silence: when the vault's own rules release it (computeTimeline's earliestRelease) with k
 * guardians confirming, and with none (the 15-period path); the keeper's two rounds come on top (KEEPER_MINUTES). A
 * release after the Drill expires never comes: that path is null, and with no path left the Drill expires first.
 *
 * `engine` is the vault's own (usePolicyEngine(snap.binding): its CPU's netlist, or the reference model where the CPU
 * has none). It comes from the chain chunk, which already carries the circuits package: built here, the engine would
 * copy that package into this chunk.
 */
export function ritualMinutes(snap: VaultSnapshot, engine: PolicyEngine): RitualDrill {
  const now = snap.status.blockTimestamp;
  const expiresAt = snap.status.expiresAt;
  const c = snap.config;
  const fresh = {
    ...evalStateOf(snap),
    state: STATE_CODES.active,
    lastAlive: now,
    alarmAt: 0n,
    inhVotes: 0,
    recVotes: c.guardians.map(() => null),
    recoveryTarget: null,
  };
  const release = (inhVotes: number): bigint | null => {
    const at = computeTimeline(engine, { ...fresh, inhVotes }, now, expiresAt).earliestRelease;
    return at !== null && expiresAt !== null && at > expiresAt ? null : at;
  };
  const silent = minutes(release(0), now);
  const keeper = KEEPER_MINUTES;
  if (c.k === 0) return silent === null ? { kind: 'expires' } : { kind: 'simple', a: silent, keeper };
  // inhVotes is a bitmask over the guardians: the first k have confirmed.
  const confirmed = minutes(release((1 << c.k) - 1), now);
  const n = c.guardians.length;
  if (confirmed === null) return { kind: 'expires' };
  return silent === null
    ? { kind: 'guardedOnly', a: confirmed, k: c.k, n, keeper }
    : { kind: 'guarded', a: confirmed, b: silent, k: c.k, n, keeper };
}
