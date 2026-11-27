// @vitest-environment node
import { evalStateOf, modelEngine } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { KEEPER_CADENCE_S } from '../../src/config/facts';
import { KEEPER_MINUTES, ritualMinutes } from '../../src/flows/impl/ritual';
import { scenarios } from '../../src/flows/impl/time-machine';
import { fixtureSnapshot } from './fixtures';

/** The devnet's engine (its CPU has no netlist): the page passes the vault's own (usePolicyEngine). */
const engine = modelEngine();

describe("the Drill's own minutes (R18.11)", () => {
  it("guarded: the rules' 4 minutes once k guardians confirm, 15 if nobody does, and the keeper's 2", () => {
    expect(ritualMinutes(fixtureSnapshot(), engine)).toEqual({ kind: 'guarded', a: 4, b: 15, k: 2, n: 3, keeper: 2 });
  });

  it("says the time machine's own minutes, and the keeper's two rounds apart from them", () => {
    // Checked in at the block just read: the time machine of the same vault tells the same silence.
    const s = fixtureSnapshot();
    const snap = { ...s, status: { ...s.status, lastAlive: s.status.blockTimestamp } };
    const now = snap.status.blockTimestamp;
    const silent = scenarios(engine, evalStateOf(snap), now, snap.status.expiresAt, true).find(
      (r) => r.id === 'silent',
    );
    const release = silent?.moments.find((m) => m.kind === 'release');
    if (!release) throw new Error('a silent Drill releases');
    const r = ritualMinutes(snap, engine);
    if (r.kind !== 'guarded') throw new Error(r.kind);
    expect(r.b * 60).toBe(Number(release.at - now));
    expect(KEEPER_MINUTES * 60).toBe(2 * KEEPER_CADENCE_S);
    // The sum is what the ritual said before it named the keeper: the time machine plus 2·KEEPER_CADENCE_S.
    expect((r.b + r.keeper) * 60).toBe(Number(release.at - now) + 2 * KEEPER_CADENCE_S);
  });

  it('without guardians: one path, about 6 minutes', () => {
    const s = fixtureSnapshot();
    const snap = { ...s, config: { ...s.config, guardians: [], k: 0, recoveryEnabled: false } };
    expect(ritualMinutes(snap, engine)).toEqual({ kind: 'simple', a: 4, keeper: 2 });
  });

  it('counts from a check-in now, whatever the vault stands at', () => {
    const s = fixtureSnapshot();
    const late = { ...s, status: { ...s.status, state: 'grace' as const, stateCode: 1, alarmAt: 1000n, inhVotes: 3 } };
    expect(ritualMinutes(late, engine)).toEqual(ritualMinutes(s, engine));
  });

  it('the silent path past the Drill: only the guardians path is said', () => {
    const s = fixtureSnapshot();
    const snap = { ...s, status: { ...s.status, expiresAt: s.status.blockTimestamp + 600n } };
    expect(ritualMinutes(snap, engine)).toEqual({ kind: 'guardedOnly', a: 4, k: 2, n: 3, keeper: 2 });
  });

  it('both paths past the Drill: it expires first', () => {
    const s = fixtureSnapshot();
    const snap = { ...s, status: { ...s.status, expiresAt: s.status.blockTimestamp + 100n } };
    expect(ritualMinutes(snap, engine)).toEqual({ kind: 'expires' });
  });

  it('is reached through the flows chunk', async () => {
    const impl = await import('../../src/flows/impl');
    expect(impl.ritualMinutes).toBe(ritualMinutes);
  });
});
