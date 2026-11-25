import type { Hex } from 'viem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS } from '../../../../scripts/lib/anvil';
import { createAtropyle, type PlanInput } from '../../src/index';
import { devnet, revertChain, sendPlanRaw, snapshotChain } from './helpers';

const [, OWNER, HEIR, OUTSIDER] = ANVIL_ACCOUNTS;

describe('counters on anvil (view functions only)', () => {
  const env = devnet();
  const atro = createAtropyle({ chain: env.deployment, builderCode: null });
  const [usdt0, usdc] = env.deployment.feeTokens;
  const plan = (drill: boolean): PlanInput => ({
    heirs: [{ account: HEIR }],
    timing: drill ? 'drill' : 'sixMonths',
    assets: [{ kind: 'erc20', token: usdt0 }],
  });
  let id: Hex;
  beforeAll(async () => {
    id = await snapshotChain(env.rpcUrl);
  });
  afterAll(async () => {
    await revertChain(env.rpcUrl, id);
  });

  it('matches the event count: vaults from the factory nonce, paid from paidCount, each split by team', async () => {
    const before = await atro.counters({ team: [OWNER] });
    const teamPaid = await atro.prepare.createVault(plan(false), { owner: OWNER, drill: false, feeToken: usdc });
    await sendPlanRaw(env, teamPaid);
    const outsideDrill = await atro.prepare.createVault(plan(true), { owner: OUTSIDER, drill: true });
    await sendPlanRaw(env, outsideDrill);

    const stats = await atro.stats();
    const after = await atro.counters({ team: [OWNER], vaults: stats.cursor.vaults.map((v) => v.vault) });
    expect(after.vaults.all).toBe(stats.vaults.total);
    expect(after.paid.all).toBe(stats.vaults.paid);
    expect(after.vaults.all).toBe(before.vaults.all + 2);
    expect(after.paid.all).toBe(before.paid.all + 1);
    expect(after.vaults.outsideTeam).toBe(before.vaults.outsideTeam + 1);
    expect(after.paid.outsideTeam).toBe(before.paid.outsideTeam);
    expect(after.releases.all).toBe(stats.releases);
    // Every vault the scan found was read, so the lower bounds are exact.
    expect(after.read).toBe(stats.vaults.total);
    expect(after.complete).toBe(true);
    // The owner approved USDT0 for the paid vault: its coverage is what the vault protects.
    const snap = await atro.vault(teamPaid.vault).snapshot();
    const covered = snap.status.assets[0].coverage;
    expect(after.stablecoins.all - before.stablecoins.all).toBe(covered);
    expect(after.stablecoins.outsideTeam).toBe(before.stablecoins.outsideTeam);
  });
});
