// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ritualMinutes } from '../../src/flows/impl/ritual';
import { fixtureSnapshot } from './fixtures';

describe("the Drill's own minutes (R18.11)", () => {
  it('guarded: about 6 minutes once k guardians confirm, about 17 if nobody does (15 periods)', () => {
    expect(ritualMinutes(fixtureSnapshot())).toEqual({ kind: 'guarded', a: 6, b: 17, k: 2, n: 3 });
  });

  it('without guardians: one path, about 6 minutes', () => {
    const s = fixtureSnapshot();
    const snap = { ...s, config: { ...s.config, guardians: [], k: 0, recoveryEnabled: false } };
    expect(ritualMinutes(snap)).toEqual({ kind: 'simple', a: 6 });
  });

  it('counts from a check-in now, whatever the vault stands at', () => {
    const s = fixtureSnapshot();
    const late = { ...s, status: { ...s.status, state: 'grace' as const, stateCode: 1, alarmAt: 1000n, inhVotes: 3 } };
    expect(ritualMinutes(late)).toEqual(ritualMinutes(s));
  });

  it('the silent path past the Drill: only the guardians path is said', () => {
    const s = fixtureSnapshot();
    const snap = { ...s, status: { ...s.status, expiresAt: s.status.blockTimestamp + 600n } };
    expect(ritualMinutes(snap)).toEqual({ kind: 'guardedOnly', a: 6, k: 2, n: 3 });
  });

  it('both paths past the Drill: it expires first', () => {
    const s = fixtureSnapshot();
    const snap = { ...s, status: { ...s.status, expiresAt: s.status.blockTimestamp + 100n } };
    expect(ritualMinutes(snap)).toEqual({ kind: 'expires' });
  });

  it('is reached through the flows chunk', async () => {
    const impl = await import('../../src/flows/impl');
    expect(impl.ritualMinutes).toBe(ritualMinutes);
  });
});
