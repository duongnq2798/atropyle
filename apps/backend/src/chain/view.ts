import { isReleasedState, planKeeperActions, type Timeline, type VaultSnapshot } from '@atropyle/sdk';
import { type Address, getAddress } from 'viem';
import type { Role } from '../types';
import type { StoredAsset, VaultView } from './port';

/**
 * The stored view of a vault (spec §9.1, §9.3): the snapshot's state, roles and assets, and next_check_at from the
 * same pure policy the keeper uses (planKeeperActions): now when an action is due, otherwise the next transition.
 */
export function deriveView(snap: VaultSnapshot, timeline: Timeline): VaultView {
  const s = snap.status;
  const c = snap.config;
  const now = s.blockTimestamp;
  const decision = planKeeperActions(s, timeline, now);
  const roles: VaultView['roles'] = [];
  const seen = new Set<string>();
  const add = (address: Address, role: Role) => {
    const a = getAddress(address);
    if (seen.has(`${a}:${role}`)) return;
    seen.add(`${a}:${role}`);
    roles.push({ address: a, role });
  };
  add(c.owner, 'owner');
  for (const h of c.heirs) add(h.account, 'heir');
  for (const g of c.guardians) add(g, 'guardian');
  const assets: StoredAsset[] = s.assets.map((a) => ({
    index: a.index,
    kind: a.asset.kind,
    token: getAddress(a.asset.token),
    id: a.asset.id.toString(),
    decimals: a.token.decimals,
  }));
  return {
    vault: getAddress(s.vault),
    owner: getAddress(c.owner),
    drill: c.drill,
    state: s.state,
    pending: s.pending,
    lastAlive: s.lastAlive,
    lateAt: s.lateAt,
    windowEndsAt: s.windowEndsAt,
    recoveryTarget: s.recoveryTarget,
    expiresAt: s.expiresAt,
    expired: s.expired,
    released: isReleasedState(s.state),
    nextCheckAt: decision.action !== null ? now : decision.nextCheckAt,
    roles,
    assets,
    blockNumber: s.blockNumber,
    blockTimestamp: now,
  };
}
