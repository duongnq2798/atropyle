import type { PolicyInputs } from '@atropyle/circuits';
import type { Address } from 'viem';
import type { VaultAction } from '../actions';
import { sameAddress } from '../address';
import type { VaultSnapshot } from '../read/types';
import { type AssetKind, isReleasedState, OUT_FLAGS, STATE_CODES, type StateName, stateName } from '../types';
import type { EngineKind, PolicyEngine } from './engine';
import { applyAction, deriveInputs, evalStateOf, recoveryVoteTarget } from './inputs';

export interface Recipient {
  assetIndex: number;
  kind: AssetKind;
  token: Address;
  to: Address;
  /** ERC-20 / ERC-1155 units, or 1 for an ERC-721. */
  amount: bigint;
}

export interface WhatIfResult {
  at: bigint;
  engine: EngineKind;
  from: StateName;
  next: StateName;
  alarm: boolean;
  cancel: boolean;
  release: boolean;
  /**
   * True when the Drill has expired at `at`: the vault reverts DrillExpired for every call, so nothing else in this
   * result is a transition and a simulation of the call reports DRILL_EXPIRED.
   */
  drillExpired: boolean;
  recoveryTarget: Address | null;
  /** Who distribute() would pay at the snapshot block once the vault is released. */
  recipients: Recipient[];
  inputs: PolicyInputs;
}

const BPS = 10_000n;

/** Same arithmetic as VaultDistribution._split20 and _distribute. */
export function recipientsFor(snap: VaultSnapshot, next: StateName, recoveryTarget: Address | null): Recipient[] {
  if (!isReleasedState(next)) return [];
  const heirs = snap.config.heirs;
  const recover = next === 'releasedRecover';
  const out: Recipient[] = [];
  for (const a of snap.status.assets) {
    const avail = a.coverage;
    if (avail === 0n) continue;
    const base = { assetIndex: a.index, kind: a.asset.kind, token: a.asset.token };
    if (recover) {
      if (recoveryTarget) out.push({ ...base, to: recoveryTarget, amount: avail });
    } else if (a.asset.kind === 'erc20') {
      let sent = 0n;
      heirs.forEach((h, i) => {
        const bps = BigInt(h.bps);
        const amount = i + 1 === heirs.length ? avail - sent : (avail / BPS) * bps + ((avail % BPS) * bps) / BPS;
        sent += amount;
        if (amount > 0n) out.push({ ...base, to: h.account, amount });
      });
    } else {
      out.push({ ...base, to: heirs[a.asset.heir].account, amount: avail });
    }
  }
  return out;
}

/** Predicts what `action` signed by `as` at time `at` does to the policy state (spec §5.3). */
export function predictAction(
  engine: PolicyEngine,
  snap: VaultSnapshot,
  action: VaultAction,
  as: Address,
  at: bigint,
): WhatIfResult | null {
  const s = evalStateOf(snap);
  const from = stateName(s.state);
  const expires = snap.status.expiresAt;
  const drillExpired = expires !== null && at >= expires;
  const base = { at, engine: engine.kind, from, alarm: false, cancel: false, release: false, drillExpired };
  if (drillExpired) {
    return { ...base, next: from, recoveryTarget: s.recoveryTarget, recipients: [], inputs: deriveInputs(s, at) };
  }
  if (isReleasedState(from)) {
    const recipients = action.type === 'distribute' ? recipientsFor(snap, from, s.recoveryTarget) : [];
    return { ...base, next: from, recoveryTarget: s.recoveryTarget, recipients, inputs: deriveInputs(s, at) };
  }
  if (action.type === 'voteRecovery') {
    // Mirrors the InvalidTarget check of voteRecovery; a null or zero target withdraws the vote and is always allowed.
    const t = recoveryVoteTarget(action.target);
    if (
      t &&
      (sameAddress(t, s.owner) || sameAddress(t, snap.status.vault) || s.guardians.some((g) => sameAddress(g, t)))
    ) {
      return null;
    }
  }
  const applied = applyAction(s, action, as, at, snap.config.drill);
  if (!applied) return null;
  const inputs = deriveInputs(applied.next, at, { alive: applied.alive, candidate: applied.candidate });
  const r = engine.step(s.state, inputs);
  const next = stateName(r.next);
  const alarm = (r.out & OUT_FLAGS.alarm) !== 0;
  const cancel = (r.out & OUT_FLAGS.cancel) !== 0;
  const candidate = s.state === STATE_CODES.recovery ? s.recoveryTarget : applied.candidate;
  let recoveryTarget = s.recoveryTarget;
  if (alarm) recoveryTarget = next === 'recovery' ? candidate : null;
  if (cancel) recoveryTarget = null;
  return {
    ...base,
    next,
    alarm,
    cancel,
    release: (r.out & OUT_FLAGS.release) !== 0,
    recoveryTarget,
    recipients: recipientsFor(snap, next, recoveryTarget),
    inputs,
  };
}
