import { modelEngine, timelineOf } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { deriveView } from '../../src/chain/view';
import { GUARDIAN, HEIR, OWNER, snapshotFixture, T0, TOKEN, VAULT } from '../helpers/fixtures';

const derive = (snap: ReturnType<typeof snapshotFixture>) => deriveView(snap, timelineOf(modelEngine(), snap));

describe('deriveView', () => {
  it('keeps what the database needs and schedules the keeper at the next transition', () => {
    const v = derive(snapshotFixture());
    expect(v).toMatchObject({
      vault: VAULT,
      owner: OWNER,
      drill: true,
      state: 'active',
      pending: 'active',
      lastAlive: T0,
      lateAt: T0 + 120n,
      expiresAt: T0 + 604_800n,
      released: false,
      nextCheckAt: T0 + 120n,
      blockNumber: 200n,
      blockTimestamp: T0,
    });
    expect(v.assets).toEqual([{ index: 0, kind: 'erc20', token: TOKEN, id: '0', decimals: 6 }]);
    expect(v.roles).toEqual([
      { address: OWNER, role: 'owner' },
      { address: HEIR, role: 'heir' },
    ]);
  });

  it('lists each address once per role, so an heir who is also a guardian has two roles', () => {
    const v = derive(
      snapshotFixture({
        config: {
          heirs: [
            { account: HEIR, bps: 5000 },
            { account: HEIR, bps: 5000 },
          ],
          guardians: [HEIR, GUARDIAN],
        },
      }),
    );
    expect(v.roles).toEqual([
      { address: OWNER, role: 'owner' },
      { address: HEIR, role: 'heir' },
      { address: HEIR, role: 'guardian' },
      { address: GUARDIAN, role: 'guardian' },
    ]);
  });

  it('asks the keeper to look now when a transition is due', () => {
    const v = derive(snapshotFixture({ status: { pending: 'grace', pendingCode: 1 } }));
    expect(v.nextCheckAt).toBe(T0);
  });

  it('marks a released vault and an expired Drill', () => {
    const released = derive(
      snapshotFixture({
        status: { state: 'releasedInherit', stateCode: 5, pending: 'releasedInherit', pendingCode: 5 },
      }),
    );
    expect(released).toMatchObject({ released: true, nextCheckAt: T0 });
    const expired = derive(snapshotFixture({ status: { expired: true } }));
    expect(expired).toMatchObject({ expired: true, nextCheckAt: null });
  });
});
