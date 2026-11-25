import { type Role, rolesOf, type Timeline, timelineOf, type VaultRef, type VaultSnapshot } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { Sdk } from './sdk';

export interface LoadedVault {
  snap: VaultSnapshot;
  timeline: Timeline;
  /** The deployment's factory created this vault, at the snapshot's block. Its own `factory()` proves nothing. */
  registered: boolean;
  fetchedAtMs: number;
}

/** One snapshot, then the registration check at that snapshot's block and the policy engine the vault is bound to. */
export async function loadVault(sdk: Sdk, vault: Address, nowMs: () => number = Date.now): Promise<LoadedVault> {
  const handle = sdk.atro.vault(vault);
  const snap = await handle.snapshot();
  // Chain time ticks from the moment the snapshot arrived, not from when the engine's netlist did.
  const fetchedAtMs = nowMs();
  const [registered, engine] = await Promise.all([
    handle.registered({ blockNumber: snap.status.blockNumber }),
    sdk.atro.engineFor(snap.binding.cpu, snap.binding.policyId),
  ]);
  return { snap, timeline: timelineOf(engine, snap), registered, fetchedAtMs };
}

export function rolesIn(snap: VaultSnapshot, account: string | null): Role[] {
  if (!account) return [];
  try {
    return rolesOf(snap, account);
  } catch {
    return [];
  }
}

export function vaultsOf(sdk: Sdk, account: Address): Promise<VaultRef[]> {
  return sdk.atro.vaultsOf(account);
}
