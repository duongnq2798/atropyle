import { describe, expect, it } from 'vitest';
import { oldDrillExpectation } from '../../scripts/old-drill';

describe('oldDrillExpectation', () => {
  it('expects the alarm, then the release, while the keeper has not reached the old Drill yet', () => {
    // The state read on mainnet on 25 Nov 2026 (block 76828230), before the backend deploy.
    expect(oldDrillExpectation({ state: 'active', pending: 'grace', expired: false })).toEqual({
      check: 'old Drill: the keeper raised the alarm, then released it',
      keeperTxs: 2,
      ends: 'released',
    });
    // An owner check-in on mainnet makes it wait for lateAt first, then the same two pokes.
    expect(oldDrillExpectation({ state: 'active', pending: 'active', expired: false }).keeperTxs).toBe(2);
  });

  it('expects one release poke when a fork lands between the two real pokes', () => {
    expect(oldDrillExpectation({ state: 'grace', pending: 'grace', expired: false })).toEqual({
      check: 'old Drill: alarm raised on mainnet before the fork, the keeper released it',
      keeperTxs: 1,
      ends: 'released',
    });
    expect(oldDrillExpectation({ state: 'grace', pending: 'releasedInherit', expired: false })).toMatchObject({
      keeperTxs: 1,
      ends: 'released',
    });
    expect(oldDrillExpectation({ state: 'recovery', pending: 'recovery', expired: false }).keeperTxs).toBe(1);
  });

  it('expects nothing once the real keeper has released it on mainnet', () => {
    for (const state of ['releasedInherit', 'releasedRecover'] as const) {
      expect(oldDrillExpectation({ state, pending: state, expired: false })).toEqual({
        check: 'old Drill: released on mainnet before the fork, the keeper sent nothing',
        keeperTxs: 0,
        ends: 'unchanged',
      });
    }
  });

  it('expects nothing once it has expired, released or not', () => {
    for (const state of ['active', 'grace', 'releasedInherit'] as const) {
      expect(oldDrillExpectation({ state, pending: state, expired: true })).toEqual({
        check: 'old Drill: expired before the fork, the keeper sent nothing',
        keeperTxs: 0,
        ends: 'unchanged',
      });
    }
  });
});
