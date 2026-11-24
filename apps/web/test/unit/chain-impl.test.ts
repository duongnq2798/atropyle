import { describe, expect, it, vi } from 'vitest';
import type { Sdk } from '../../src/chain/impl/sdk';
import { loadVault, rolesIn } from '../../src/chain/impl/vault';
import { fixtureDeployment, fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

vi.mock('@atropyle/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@atropyle/sdk')>()),
  timelineOf: () => fixtureTimeline(),
}));

describe('chain impl', () => {
  it('loads a vault at one block: snapshot, registration and timeline', async () => {
    const snap = fixtureSnapshot();
    const registered = vi.fn(async () => true);
    const engineFor = vi.fn(async () => ({}));
    const sdk = {
      atro: { vault: () => ({ snapshot: async () => snap, registered }), engineFor },
      deployment: fixtureDeployment(),
    } as unknown as Sdk;
    const loaded = await loadVault(sdk, PEOPLE.vault, () => 42);
    expect(registered).toHaveBeenCalledWith({ blockNumber: snap.status.blockNumber });
    expect(engineFor).toHaveBeenCalledWith(snap.binding.cpu, snap.binding.policyId);
    expect(loaded).toEqual({ snap, timeline: fixtureTimeline(), registered: true, fetchedAtMs: 42 });
  });

  it('finds the roles of an account and none for a stranger or garbage', () => {
    const snap = fixtureSnapshot();
    expect(rolesIn(snap, PEOPLE.owner)).toContain('owner');
    expect(rolesIn(snap, PEOPLE.heirB)).toEqual(expect.arrayContaining(['heir', 'guardian']));
    expect(rolesIn(snap, PEOPLE.stranger)).toEqual([]);
    expect(rolesIn(snap, null)).toEqual([]);
    expect(rolesIn(snap, 'not an address')).toEqual([]);
  });
});
