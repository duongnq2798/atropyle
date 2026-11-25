import { timelineOf } from '@atropyle/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { Sdk } from '../../src/chain/impl/sdk';
import { loadVault, rolesIn } from '../../src/chain/impl/vault';
import { fixtureDeployment, fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

vi.mock('@atropyle/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@atropyle/sdk')>()),
  timelineOf: vi.fn(() => fixtureTimeline()),
}));

describe('chain impl', () => {
  it('loads a vault at one block: snapshot, registration and timeline', async () => {
    const snap = fixtureSnapshot();
    const engine = { netlist: 'policy' };
    let clock = 42;
    const registered = vi.fn(async () => true);
    // The engine's netlist arrives later than the snapshot; the chain clock starts at the snapshot.
    const engineFor = vi.fn(async () => {
      clock = 99;
      return engine;
    });
    const sdk = {
      atro: { vault: () => ({ snapshot: async () => snap, registered }), engineFor },
      deployment: fixtureDeployment(),
    } as unknown as Sdk;
    const loaded = await loadVault(sdk, PEOPLE.vault, () => clock);
    expect(registered).toHaveBeenCalledWith({ blockNumber: snap.status.blockNumber });
    expect(engineFor).toHaveBeenCalledWith(snap.binding.cpu, snap.binding.policyId);
    expect(timelineOf).toHaveBeenCalledWith(engine, snap);
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
