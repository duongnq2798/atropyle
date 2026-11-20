import { describe, expect, it } from 'vitest';
import { confirmTarget, guardianRows, tally } from '../../src/lib/guardian';
import { fixtureSnapshot, PEOPLE } from './fixtures';

describe('guardian helpers', () => {
  it('confirmTarget needs the same valid address twice', () => {
    expect(confirmTarget('', PEOPLE.stranger)).toEqual({ ok: false, reason: 'empty' });
    expect(confirmTarget('0x1234', '0x1234')).toEqual({ ok: false, reason: 'invalid' });
    const badChecksum = PEOPLE.stranger.replace('dC', 'Dc');
    expect(confirmTarget(badChecksum, badChecksum)).toEqual({ ok: false, reason: 'invalid' });
    expect(confirmTarget(PEOPLE.stranger, PEOPLE.g1)).toEqual({ ok: false, reason: 'mismatch' });
    expect(confirmTarget(` ${PEOPLE.stranger.toLowerCase()}`, PEOPLE.stranger)).toEqual({
      ok: true,
      target: PEOPLE.stranger,
    });
  });

  it('confirmTarget refuses the zero address', () => {
    const zero = '0x0000000000000000000000000000000000000000';
    expect(confirmTarget(zero, zero)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('guardianRows shows every guardian with their confirmation and vote', () => {
    const snap = fixtureSnapshot();
    snap.status.inhVoters = [PEOPLE.g2];
    snap.status.recVotes = [
      { guardian: PEOPLE.g1, target: PEOPLE.stranger },
      { guardian: PEOPLE.g2, target: null },
      { guardian: PEOPLE.heirB, target: PEOPLE.stranger },
    ];
    expect(guardianRows(snap, PEOPLE.g1.toLowerCase())).toEqual([
      { guardian: PEOPLE.g1, attested: false, target: PEOPLE.stranger, me: true },
      { guardian: PEOPLE.g2, attested: true, target: null, me: false },
      { guardian: PEOPLE.heirB, attested: false, target: PEOPLE.stranger, me: false },
    ]);
    expect(guardianRows(snap, null).some((r) => r.me)).toBe(false);
  });

  it('tally counts the votes per target, most first', () => {
    const snap = fixtureSnapshot();
    snap.status.recVotes = [
      { guardian: PEOPLE.g1, target: PEOPLE.stranger },
      { guardian: PEOPLE.g2, target: PEOPLE.owner },
      { guardian: PEOPLE.heirB, target: PEOPLE.stranger },
    ];
    expect(tally(guardianRows(snap, null))).toEqual([
      { target: PEOPLE.stranger, votes: 2 },
      { target: PEOPLE.owner, votes: 1 },
    ]);
  });
});
