// What stage 0 of `npm run rehearse:drills` (rehearse-drills.ts) expects the keeper to do on the team's old Drill,
// given the state the fork starts from. Once the backend is deployed, the real keeper reaches the old Drill on
// mainnet within two ticks, so every later fork starts with the old Drill in grace or already released, and
// from 29 Nov 2026 08:28:06 UTC expired. The rehearsal then expects fewer keeper transactions instead of failing.
// Pure, so test/unit/old-drill.test.ts covers it without a network.
import { isReleasedState, type StateName } from '@atropyle/sdk';

/** The old Drill's status at the fork block. */
export interface OldDrillStart {
  state: StateName;
  pending: StateName;
  expired: boolean;
}

export interface OldDrillExpectation {
  /** The name of the rehearsal check. */
  check: string;
  /** Keeper transactions the fork must see on the old Drill, the first tick included. */
  keeperTxs: number;
  /** `released`: it must end released on the fork; `unchanged`: it must end in the state it started in. */
  ends: 'released' | 'unchanged';
}

export function oldDrillExpectation(s: OldDrillStart): OldDrillExpectation {
  // An expired Drill reverts every transition, and a released one is final: the keeper has nothing to send.
  if (s.expired) {
    return { check: 'old Drill: expired before the fork, the keeper sent nothing', keeperTxs: 0, ends: 'unchanged' };
  }
  if (isReleasedState(s.state)) {
    return {
      check: 'old Drill: released on mainnet before the fork, the keeper sent nothing',
      keeperTxs: 0,
      ends: 'unchanged',
    };
  }
  // One poke releases it: the window is over, or the alarm is already up and only the window is left.
  if (isReleasedState(s.pending)) {
    return { check: 'old Drill: release due at the fork, the keeper released it', keeperTxs: 1, ends: 'released' };
  }
  if (s.state !== 'active') {
    return {
      check: 'old Drill: alarm raised on mainnet before the fork, the keeper released it',
      keeperTxs: 1,
      ends: 'released',
    };
  }
  // Active: one poke raises the alarm and, once the window is over, a second one releases it.
  return { check: 'old Drill: the keeper raised the alarm, then released it', keeperTxs: 2, ends: 'released' };
}
