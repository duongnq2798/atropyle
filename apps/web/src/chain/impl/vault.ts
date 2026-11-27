import { type Role, rolesOf, type Timeline, timelineOf, type VaultRef, type VaultSnapshot } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { Sdk } from './sdk';

/**
 * One read of a vault. `registered`: the deployment's factory created it, at the snapshot's block (its own
 * `factory()` proves nothing). Only such a vault has a timeline: a contract the factory did not create may name any
 * CPU, and the page shows nothing it says.
 */
export type LoadedVault =
  | { snap: VaultSnapshot; registered: true; timeline: Timeline; fetchedAtMs: number }
  | { snap: VaultSnapshot; registered: false; timeline: null; fetchedAtMs: number };

export type RegisteredVault = Extract<LoadedVault, { registered: true }>;

/**
 * One snapshot, then the registration check at that snapshot's block, then (for a registered vault only) the policy
 * engine the vault is bound to. Sequential on purpose: the engine is cached after the first read, so the cost is one
 * round trip on a vault's first load.
 */
export async function loadVault(sdk: Sdk, vault: Address, nowMs: () => number = Date.now): Promise<LoadedVault> {
  const handle = sdk.atro.vault(vault);
  const snap = await handle.snapshot();
  // Chain time ticks from the moment the snapshot arrived, not from when the engine's netlist did.
  const fetchedAtMs = nowMs();
  const registered = await handle.registered({ blockNumber: snap.status.blockNumber });
  if (!registered) return { snap, registered: false, timeline: null, fetchedAtMs };
  const engine = await sdk.atro.engineFor(snap.binding.cpu, snap.binding.policyId);
  return { snap, registered: true, timeline: timelineOf(engine, snap), fetchedAtMs };
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
