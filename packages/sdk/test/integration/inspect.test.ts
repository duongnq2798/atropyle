import { encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS } from '../../../../scripts/lib/anvil';
import { createAtropyle, type PlanInput, toPayload } from '../../src/index';
import { devnet, revertChain, sendPlanRaw, snapshotChain } from './helpers';

const [, OWNER, HEIR, G1, G2, HEIR2, NEW_WALLET, , STRANGER] = ANVIL_ACCOUNTS;

describe('inspecting signing links', () => {
  const env = devnet();
  const atro = createAtropyle({ chain: env.deployment, builderCode: 'atropyle-test' });
  const [usdt0, usdc] = env.deployment.feeTokens;
  const nft = env.deployment.mocks!.nft;
  const guarded: PlanInput = {
    heirs: [
      { account: HEIR, percent: 70 },
      { account: HEIR2, percent: 30 },
    ],
    guardians: [G1, G2, HEIR2],
    k: 2,
    recoveryEnabled: true,
    timing: 'drill',
    assets: [
      { kind: 'erc20', token: usdt0 },
      { kind: 'erc721', token: nft, id: 2, heir: 1 },
    ],
  };
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(env.rpcUrl);
  });
  afterEach(async () => {
    await revertChain(env.rpcUrl, id);
  });

  it('accepts a prepared paid creation and rebuilds the same summaries', async () => {
    const plan = await atro.prepare.createVault(
      { ...guarded, timing: 'sixMonths' },
      { owner: OWNER, drill: false, feeToken: usdc },
    );
    const check = await atro.handoff.inspect(atro.handoff.link(plan, 'https://x.test'));
    expect(check.ok).toBe(true);
    expect(check.vault).toBe(plan.vault);
    expect(check.steps.map((s) => s.action)).toEqual(['approve', 'createVault', 'approve', 'approve']);
    expect(check.steps.map((s) => s.summary)).toEqual(plan.steps.map((s) => s.summary));
    expect(check.steps.every((s) => s.builderCodes?.[0] === 'atropyle-test')).toBe(true);
    expect(check.steps.map((s) => s.warnings)).toEqual(plan.steps.map((s) => s.warnings));
  });

  it('rebuilds the unlimited-approval warning of the plan', async () => {
    const plan = await atro.prepare.createVault(guarded, { owner: OWNER, drill: true, allowance: 'unlimited' });
    expect(plan.steps.flatMap((s) => s.warnings.map((w) => w.code))).toContain('UNLIMITED_APPROVAL');
    const check = await atro.handoff.inspect(toPayload(plan));
    expect(check.ok).toBe(true);
    expect(check.steps.map((s) => s.warnings)).toEqual(plan.steps.map((s) => s.warnings));
  });

  it('rejects a request that is not a valid payload, however it arrives', async () => {
    const p = toPayload(await atro.prepare.createVault(guarded, { owner: OWNER, drill: true }));
    await expect(atro.handoff.inspect({ ...p, steps: [] })).rejects.toMatchObject({ code: 'LINK_INVALID' });
    await expect(atro.handoff.inspect({} as never)).rejects.toMatchObject({ code: 'LINK_INVALID' });
    const lower = { ...p, from: p.from.toLowerCase() as typeof p.from };
    expect((await atro.handoff.inspect(lower)).from).toBe(p.from);
  });

  it('refuses tampered approvals, unknown targets and the wrong chain', async () => {
    const plan = await atro.prepare.createVault(guarded, { owner: OWNER, drill: true });
    const p = toPayload(plan);
    const evil = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [STRANGER, 10n ** 30n] });
    const tampered = { ...p, steps: p.steps.map((s, i) => (i === 1 ? { ...s, data: evil } : s)) };
    const a = await atro.handoff.inspect(tampered);
    expect(a.ok).toBe(false);
    expect(a.steps[1]).toMatchObject({
      allowed: false,
      summary: null,
      reason: expect.stringContaining('not an Atropyle vault'),
    });
    expect(a.steps.every((s) => s.simulation.ok === 'skipped')).toBe(true);
    const transfer = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [STRANGER, 1n] });
    const b = await atro.handoff.inspect({ ...p, steps: [{ to: usdt0, data: transfer, value: 0n }] });
    expect(b.steps[0]).toMatchObject({ allowed: false, reason: expect.stringContaining('unknown call') });
    const c = await atro.handoff.inspect({ ...p, chainId: 196 });
    expect(c.ok).toBe(false);
    expect(c.steps[0].reason).toContain('chain 196');
  });

  it("refuses approvals to someone else's vault and accepts guardian votes", async () => {
    const plan = await atro.prepare.createVault(guarded, { owner: OWNER, drill: true });
    await sendPlanRaw(env, plan);
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [plan.vault, 1n] });
    const other = await atro.handoff.inspect({
      chainId: 31337,
      from: STRANGER,
      steps: [{ to: usdt0, data: approve, value: 0n }],
    });
    expect(other.steps[0].reason).toContain('does not belong to the signer');
    const vote = await atro.vault(plan.vault).prepare({ type: 'voteRecovery', target: NEW_WALLET }, { as: G1 });
    const check = await atro.handoff.inspect(toPayload(vote));
    expect(check.ok).toBe(true);
    expect(check.steps[0].summary).toBe(vote.steps[0].summary);
  });
});
