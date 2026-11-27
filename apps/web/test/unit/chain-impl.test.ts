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
    // The factory's word comes first: only a vault it created has its policy read.
    expect(registered.mock.invocationCallOrder[0]).toBeLessThan(engineFor.mock.invocationCallOrder[0]);
    expect(timelineOf).toHaveBeenCalledWith(engine, snap);
    expect(loaded).toEqual({ snap, timeline: fixtureTimeline(), registered: true, fetchedAtMs: 42 });
  });

  it('never reads the policy of a contract the factory did not create', async () => {
    const snap = fixtureSnapshot();
    const registered = vi.fn(async () => false);
    // A fake may name any CPU: reading it would fail the whole page with POLICY_MISMATCH (parked 7A).
    const engineFor = vi.fn(async () => {
      throw Object.assign(new Error('not a policy'), { code: 'POLICY_MISMATCH' });
    });
    const sdk = {
      atro: { vault: () => ({ snapshot: async () => snap, registered }), engineFor },
      deployment: fixtureDeployment(),
    } as unknown as Sdk;
    const loaded = await loadVault(sdk, PEOPLE.vault, () => 7);
    expect(engineFor).not.toHaveBeenCalled();
    expect(loaded).toEqual({ snap, registered: false, timeline: null, fetchedAtMs: 7 });
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
