import { planError } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { assetRows, assetsInput, heirRows, heirsInput, timingFormOf, timingInput } from '../../src/lib/create-form';
import { fixCoverageAction, guardiansAction, planIssues, vaultView } from '../../src/lib/vault-view';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

describe('vault view', () => {
  it('finds the roles of the connected account', () => {
    const snap = fixtureSnapshot();
    const t = fixtureTimeline();
    expect(vaultView(snap, t, PEOPLE.owner).roles).toEqual(['owner']);
    expect(vaultView(snap, t, PEOPLE.heirB.toLowerCase()).roles).toEqual(['heir', 'guardian']);
    expect(vaultView(snap, t, PEOPLE.stranger).roles).toEqual([]);
    expect(vaultView(snap, t, null).roles).toEqual([]);
  });

  it('reports coverage per asset and flags partial coverage only for held assets', () => {
    const v = vaultView(fixtureSnapshot(), fixtureTimeline(), null);
    expect(v.assets.map((a) => [a.index, a.percent])).toEqual([
      [0, 50],
      [1, null],
    ]);
    expect(v.lowCoverage).toEqual([0]);
    expect(v.next).toMatchObject({ kind: 'alarm', at: 1_110n });
    expect(v.released).toBe(false);
    const done = fixtureSnapshot();
    done.status.state = 'releasedInherit';
    done.status.assets[0].coverage = 1_000_000n;
    const w = vaultView(done, { ...fixtureTimeline(), events: [] }, null);
    expect(w.released).toBe(true);
    expect(w.lowCoverage).toEqual([]);
    expect(w.next).toBeNull();
  });

  it('turns the config back into editable rows and the same inputs', () => {
    const c = fixtureSnapshot().config;
    const heirs = heirRows(c.heirs);
    expect(heirs).toEqual([
      { account: PEOPLE.heirA, percent: '70' },
      { account: PEOPLE.heirB, percent: '30' },
    ]);
    expect(heirsInput(heirs)).toEqual([
      { account: PEOPLE.heirA, percent: 70 },
      { account: PEOPLE.heirB, percent: 30 },
    ]);
    expect(heirRows([{ account: PEOPLE.heirA, bps: 10000 }])).toEqual([{ account: PEOPLE.heirA, percent: '' }]);
    const assets = [
      { kind: 'erc20', token: PEOPLE.token },
      { kind: 'erc721', token: PEOPLE.nft, id: '2', heir: 1 },
    ];
    expect(assetsInput(assetRows(c.assets))).toEqual(assets);
    expect(fixCoverageAction(c)).toEqual({ type: 'setAssets', assets });
    expect(timingFormOf(c.timing, true)).toEqual({ preset: 'drill', period: '', threshold: '', window: '' });
    expect(timingInput(timingFormOf(c.timing, true))).toBe('drill');
    const custom = timingFormOf({ period: 86_400, threshold: 3, window: 259_200 }, false);
    expect(custom).toEqual({ preset: 'custom', period: '1d', threshold: '3', window: '3d' });
    expect(timingInput(custom)).toEqual({ period: '1d', threshold: 3, window: '3d' });
  });

  it('builds setGuardians with the SDK majority and drops recovery without guardians', () => {
    expect(guardiansAction([PEOPLE.g1, PEOPLE.g2, ` ${PEOPLE.heirB}`], '', true)).toEqual({
      type: 'setGuardians',
      guardians: [PEOPLE.g1, PEOPLE.g2, PEOPLE.heirB],
      k: 2,
      recoveryEnabled: true,
    });
    expect(guardiansAction([PEOPLE.g1], '1', false)).toEqual({
      type: 'setGuardians',
      guardians: [PEOPLE.g1],
      k: 1,
      recoveryEnabled: false,
    });
    expect(guardiansAction([], '2', true)).toEqual({
      type: 'setGuardians',
      guardians: [],
      k: 0,
      recoveryEnabled: false,
    });
  });

  it('planIssues reads the issues of a PLAN_INVALID error only', () => {
    const issues = [
      { path: 'heirs', code: 'SHARES_SUM' as const, message: 'heirs: percent shares must add up to 100' },
    ];
    expect(planIssues(planError(issues))).toEqual(issues);
    expect(planIssues(new Error('boom'))).toEqual([]);
  });
});
