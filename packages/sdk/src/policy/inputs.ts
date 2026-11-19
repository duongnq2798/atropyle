import type { PolicyInputs } from '@atropyle/circuits';
import type { Address } from 'viem';
import type { VaultAction } from '../actions';
import { sameAddress, toAddress, ZERO_ADDRESS } from '../address';
import { resolveTiming } from '../plan/validate';
import type { VaultSnapshot } from '../read/types';
import { STATE_CODES, type Timing } from '../types';

/** Everything AtropyleVault._evaluate reads, in plain values. alarmAt = 0n means no alarm. */
export interface EvalState {
  state: number;
  owner: Address;
  lastAlive: bigint;
  alarmAt: bigint;
  timing: Timing;
  k: number;
  recoveryEnabled: boolean;
  guardians: Address[];
  inhVotes: number;
  recVotes: (Address | null)[];
  recoveryTarget: Address | null;
}

export function evalStateOf(snap: VaultSnapshot): EvalState {
  const { config: c, status: st } = snap;
  return {
    state: st.stateCode,
    owner: c.owner,
    lastAlive: st.lastAlive,
    alarmAt: st.alarmAt ?? 0n,
    timing: c.timing,
    k: c.k,
    recoveryEnabled: c.recoveryEnabled,
    guardians: c.guardians,
    inhVotes: st.inhVotes,
    recVotes: st.recVotes.map((v) => v.target),
    recoveryTarget: st.recoveryTarget,
  };
}

/** Same inputs as AtropyleVault._evaluate at time `now` (spec §5.3). */
export function deriveInputs(
  s: EvalState,
  now: bigint,
  opts: { alive?: boolean; candidate?: Address | null } = {},
): PolicyInputs {
  const elapsed = now > s.lastAlive ? now - s.lastAlive : 0n;
  const periods = elapsed / BigInt(s.timing.period);
  const candidate = s.state === STATE_CODES.recovery ? s.recoveryTarget : (opts.candidate ?? null);
  let recVotes = 0;
  if (candidate && s.recoveryEnabled) {
    s.guardians.forEach((_, i) => {
      if (sameAddress(s.recVotes[i], candidate)) recVotes |= 1 << i;
    });
  }
  return {
    idle: periods > 15n ? 15 : Number(periods),
    threshold: s.timing.threshold,
    inhVotes: s.inhVotes,
    recVotes,
    k: s.k,
    alive: opts.alive ?? false,
    windowDone: s.alarmAt !== 0n && now >= s.alarmAt + BigInt(s.timing.window),
  };
}

export interface Applied {
  next: EvalState;
  alive: boolean;
  candidate: Address | null;
}

/**
 * The recovery target of a voteRecovery call, normalized: null (no vote) for null and for the zero address, which the
 * vault also reads as "withdraw my vote". Throws INVALID_ADDRESS with path `target` for anything else malformed.
 */
export function recoveryVoteTarget(target: string | null): Address | null {
  if (target === null) return null;
  const a = toAddress(target, 'target');
  return a === ZERO_ADDRESS ? null : a;
}

function ownerAlive(s: EvalState, at: bigint): EvalState {
  return { ...s, lastAlive: at, inhVotes: 0, recVotes: s.recVotes.map(() => null) };
}

/** State right before the policy step of `action`; null when the call is sure to revert or changes no policy input. */
export function applyAction(
  s: EvalState,
  action: VaultAction,
  as: Address,
  at: bigint,
  drill: boolean,
): Applied | null {
  const isOwner = sameAddress(as, s.owner);
  const gi = s.guardians.findIndex((g) => sameAddress(g, as));
  switch (action.type) {
    case 'checkIn':
    case 'setHeirs':
    case 'setAssets':
      return isOwner ? { next: ownerAlive(s, at), alive: true, candidate: null } : null;
    case 'setGuardians': {
      if (!isOwner) return null;
      const guardians = action.guardians.map((g, i) => toAddress(g, `guardians[${i}]`));
      const next = {
        ...ownerAlive(s, at),
        guardians,
        k: action.k,
        recoveryEnabled: action.recoveryEnabled,
        recVotes: guardians.map(() => null),
      };
      return { next, alive: true, candidate: null };
    }
    case 'setTiming':
      return isOwner
        ? { next: { ...ownerAlive(s, at), timing: resolveTiming(action.timing, drill) }, alive: true, candidate: null }
        : null;
    case 'attestDeath': {
      if (gi < 0) return null;
      const bit = 1 << gi;
      return {
        next: { ...s, inhVotes: action.on ? s.inhVotes | bit : s.inhVotes & ~bit },
        alive: false,
        candidate: null,
      };
    }
    case 'voteRecovery': {
      if (gi < 0 || !s.recoveryEnabled) return null;
      const target = recoveryVoteTarget(action.target);
      const recVotes = [...s.recVotes];
      recVotes[gi] = target;
      return { next: { ...s, recVotes }, alive: false, candidate: target };
    }
    case 'poke':
    case 'distribute':
      // Signed by the owner of a vault that is not released, both are a check-in (AtropyleVault.poke/distribute).
      return isOwner
        ? { next: ownerAlive(s, at), alive: true, candidate: null }
        : { next: s, alive: false, candidate: null };
    case 'revokeAll':
      return null;
  }
}
