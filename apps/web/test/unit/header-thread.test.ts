import { describe, expect, it } from 'vitest';
import { headerThread } from '../../src/app/vault/header-thread';
import { courseX, drawnAxis } from '../../src/thread/geometry';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

const snap = fixtureSnapshot(); // active, lastAlive 990, lateAt 1050, 3 guardians, k 2, heirs 70/30
const tl = fixtureTimeline(); // earliestRelease 1230
const at = (over: Partial<typeof snap.status>) => ({ ...snap.status, ...over });

describe('the vault header thread', () => {
  it("runs from the last check-in to when the heirs can receive, on the vault's own wave, with its guardians", () => {
    const h = headerThread(snap.config, snap.status, tl, 1_000n);
    expect(h).toMatchObject({ state: 'active', predicted: false });
    expect(h.input).toMatchObject({
      signature: PEOPLE.vault,
      predicted: false,
      posts: { n: 3, k: 2, lit: 0 },
      branches: [7000, 3000],
      axis: { to: 1_230n, now: 1_000n, alarmAt: 1_050n, releaseAt: 1_230n },
    });
    // No check-in knots: the history has its own axis (§18.3.1 thread-time-axis).
    expect(h.input.axis?.marks).toBeUndefined();
    expect(h.input.knots).toBeUndefined();
  });

  it('starts a little before the last check-in, so "now" just after one is not cut in half by the box', () => {
    const axis = headerThread(snap.config, snap.status, tl, 990n).input.axis;
    if (!axis) throw new Error('no axis');
    expect(axis.from).toBeLessThan(990n);
    // The now dot is 12 px across; at 358 px of thread that is 10 of the 600 view units.
    expect(courseX(990n, drawnAxis(axis))).toBeGreaterThan(10);
  });

  it('draws what the rules allow, dashed, when nobody has acted on it yet', () => {
    const h = headerThread(snap.config, at({ pending: 'grace' }), tl, 1_060n);
    expect(h).toMatchObject({ state: 'grace', predicted: true, input: { predicted: true, axis: { alarmAt: 1_050n } } });
  });

  it('frays from the raised alarm and lights a post per confirmation', () => {
    const s = at({
      state: 'grace',
      pending: 'grace',
      alarmAt: 1_100n,
      windowEndsAt: 1_220n,
      inhVoters: [PEOPLE.g1],
      inhVotes: 1,
    });
    const h = headerThread(snap.config, s, { earliestRelease: 1_220n }, 1_150n);
    expect(h.input).toMatchObject({ axis: { alarmAt: 1_100n, releaseAt: 1_220n }, posts: { lit: 1 } });
  });

  it('in a recovery counts only the votes for the recovery wallet', () => {
    const s = at({
      state: 'recovery',
      pending: 'recovery',
      alarmAt: 1_100n,
      windowEndsAt: 1_220n,
      recoveryTarget: PEOPLE.stranger,
      recVotes: [
        { guardian: PEOPLE.g1, target: PEOPLE.stranger },
        { guardian: PEOPLE.g2, target: PEOPLE.heirA },
        { guardian: PEOPLE.heirB, target: null },
      ],
    });
    expect(headerThread(snap.config, s, { earliestRelease: 1_220n }, 1_150n).input.posts).toEqual({
      n: 3,
      k: 2,
      lit: 1,
    });
  });

  it('ends at the release once released, and an expired Drill is never predicted', () => {
    const released = at({ state: 'releasedInherit', pending: 'releasedInherit', releasedAt: 1_300n });
    expect(headerThread(snap.config, released, { earliestRelease: null }, 1_400n).input.axis).toMatchObject({
      to: 1_300n,
      releaseAt: 1_300n,
    });
    const expired = at({ expired: true, pending: 'grace' });
    expect(headerThread(snap.config, expired, tl, 700_000n)).toMatchObject({ state: 'expired', predicted: false });
  });
});
