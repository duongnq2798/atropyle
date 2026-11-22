import { zeroAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import type { StoredEvent } from '../../src/store/notices';
import type { VaultRow } from '../../src/store/vaults';
import { dueReminder, planEventNotices, transferOf } from '../../src/tick/notices';
import { GUARDIAN, HEIR, OWNER, T0, TARGET, TOKEN, txh, VAULT } from '../helpers/fixtures';

const TX = txh(77);

function ev(name: string, args: Record<string, unknown>, logIndex = 0): StoredEvent {
  return { txHash: TX, logIndex, vault: VAULT, name, block: 300n, at: T0 - 5n, args };
}

function row(over: Partial<VaultRow> = {}): VaultRow {
  return {
    address: VAULT,
    owner: OWNER,
    drill: true,
    createdBlock: 150n,
    state: 'grace',
    pendingState: 'grace',
    lastAlive: T0 - 200n,
    lastAliveBlock: 150n,
    lateAt: T0 - 80n,
    windowEndsAt: T0 + 115n,
    recoveryTarget: null,
    nextCheckAt: T0 + 115n,
    expiresAt: T0 + 600_000n,
    expired: false,
    released: false,
    assets: [
      { index: 0, kind: 'erc20', token: TOKEN, id: '0', decimals: 6 },
      { index: 1, kind: 'erc721', token: TOKEN, id: '0', decimals: null },
      { index: 2, kind: 'erc1155', token: TOKEN, id: '7', decimals: null },
    ],
    updatedBlock: 300n,
    viewBlock: 300n,
    ...over,
  };
}

const route = (ns: ReturnType<typeof planEventNotices>) => ns.map((n) => `${n.role}:${n.kind}`);

describe('planEventNotices', () => {
  it('alerts owner, guardians and heirs when the inheritance window opens, with its end as deadline', () => {
    const ns = planEventNotices(ev('AlarmRaised', { state: 1, target: zeroAddress }, 4), row(), []);
    expect(route(ns)).toEqual(['owner:alarm-owner', 'guardian:alarm-guardian', 'heir:alarm-heir']);
    expect(ns[0]).toMatchObject({ periodKey: `${TX}:4`, facts: { deadline: T0 + 115n, alarm: 'inheritance' } });
  });

  it('alerts owner and guardians, not heirs, when the recovery window opens', () => {
    const ns = planEventNotices(ev('AlarmRaised', { state: 3, target: TARGET }), row({ state: 'recovery' }), []);
    expect(route(ns)).toEqual(['owner:alarm-owner', 'guardian:alarm-guardian']);
    expect(ns[0].facts.alarm).toBe('recovery');
  });

  it('sends nothing for an alarm the stored view no longer shows', () => {
    expect(
      planEventNotices(
        ev('AlarmRaised', { state: 1, target: zeroAddress }),
        row({ state: 'active', windowEndsAt: null }),
        [],
      ),
    ).toEqual([]);
  });

  it('tells the owner about a recovery vote with a target, and ignores a withdrawn vote', () => {
    const ns = planEventNotices(ev('RecoveryVoted', { guardian: GUARDIAN, target: TARGET }), row(), []);
    expect(ns).toEqual([
      { role: 'owner', kind: 'recovery-vote', periodKey: `${TX}:0`, facts: { guardian: GUARDIAN, target: TARGET } },
    ]);
    expect(planEventNotices(ev('RecoveryVoted', { guardian: GUARDIAN, target: zeroAddress }), row(), [])).toEqual([]);
  });

  it('routes a release by its state', () => {
    const toHeirs = planEventNotices(ev('Released', { state: 5, target: zeroAddress }), row(), []);
    expect(route(toHeirs)).toEqual(['heir:released', 'guardian:released']);
    expect(toHeirs[0]).toMatchObject({ periodKey: TX, facts: { tx: TX, released: 'inheritance' } });
    const toOwner = planEventNotices(ev('Released', { state: 7, target: TARGET }), row(), []);
    expect(route(toOwner)).toEqual(['owner:released', 'guardian:released']);
    expect(toOwner[0].facts.released).toBe('recovery');
  });

  it('sends one payout email per transaction with every transfer, to the owner after a recovery', () => {
    const group = [
      ev('Distributed', { assetIndex: '0', to: HEIR, amountOrId: '10000000000' }, 1),
      ev('Distributed', { assetIndex: '1', to: HEIR, amountOrId: '42' }, 2),
    ];
    const ns = planEventNotices(group[0], row({ state: 'releasedInherit' }), group);
    expect(ns).toEqual([
      {
        role: 'heir',
        kind: 'distributed',
        periodKey: TX,
        facts: {
          tx: TX,
          transfers: [
            { kind: 'erc20', token: TOKEN, to: HEIR, amount: '10000', id: null },
            { kind: 'erc721', token: TOKEN, to: HEIR, amount: null, id: '42' },
          ],
        },
      },
    ]);
    expect(route(planEventNotices(group[0], row({ state: 'releasedRecover' }), group))).toEqual(['owner:distributed']);
  });

  it('ignores events that need no email', () => {
    for (const name of ['Alive', 'StateChanged', 'AlarmCancelled', 'ConfigUpdated', 'Attested', 'TransferFailed']) {
      expect(planEventNotices(ev(name, {}), row(), []), name).toEqual([]);
    }
  });
});

describe('transferOf', () => {
  it('formats each asset kind and survives an unknown asset index', () => {
    const assets = row().assets;
    expect(transferOf(assets, ev('Distributed', { assetIndex: '2', to: HEIR, amountOrId: '3' }))).toEqual({
      kind: 'erc1155',
      token: TOKEN,
      to: HEIR,
      amount: '3',
      id: '7',
    });
    expect(transferOf(assets, ev('Distributed', { assetIndex: '9', to: HEIR, amountOrId: '5' }))).toEqual({
      kind: 'unknown',
      token: null,
      to: HEIR,
      amount: '5',
      id: '9',
    });
    const noDecimals = [{ index: 0, kind: 'erc20' as const, token: TOKEN, id: '0', decimals: null }];
    expect(transferOf(noDecimals, ev('Distributed', { assetIndex: '0', to: HEIR, amountOrId: '1500' })).amount).toBe(
      '1500',
    );
  });
});

describe('dueReminder', () => {
  // Check-in at 1000, late at 1120 (Drill: 2 periods of 60 s).
  it('fires at 50%, 80% and 100% of the period, the highest that is due', () => {
    expect(dueReminder(1000n, 1120n, 1059n)).toBeNull();
    expect(dueReminder(1000n, 1120n, 1060n)).toBe('checkin-50');
    expect(dueReminder(1000n, 1120n, 1095n)).toBe('checkin-50');
    expect(dueReminder(1000n, 1120n, 1096n)).toBe('checkin-80');
    expect(dueReminder(1000n, 1120n, 1120n)).toBe('checkin-due');
    expect(dueReminder(1000n, 1120n, 9999n)).toBe('checkin-due');
    expect(dueReminder(1000n, 1000n, 1001n)).toBeNull();
  });
});
