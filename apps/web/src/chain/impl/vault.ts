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

/** One snapshot, then the registration check and the engine at that snapshot's block. */
export async function loadVault(sdk: Sdk, vault: Address, nowMs: () => number = Date.now): Promise<LoadedVault> {
  const handle = sdk.atro.vault(vault);
  const snap = await handle.snapshot();
  const [registered, engine] = await Promise.all([
    handle.registered({ blockNumber: snap.status.blockNumber }),
    sdk.atro.engineFor(snap.binding.cpu, snap.binding.policyId),
  ]);
  return { snap, timeline: timelineOf(engine, snap), registered, fetchedAtMs: nowMs() };
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
