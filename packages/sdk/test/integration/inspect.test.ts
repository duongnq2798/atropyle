import { encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS } from '../../../../scripts/lib/anvil';
import { vaultAbi } from '../../src/abi/index';
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
    const check = await atro.handoff.inspect(toPayload(plan), { confirmed: [HEIR, HEIR2, G1, G2, HEIR2] });
    expect(check.ok).toBe(true);
    expect(check.steps.map((s) => s.warnings)).toEqual(plan.steps.map((s) => s.warnings));
  });

  it('holds our own Drill link with approvals until the heirs and guardians are typed again', async () => {
    const plan = await atro.prepare.createVault(guarded, { owner: OWNER, drill: true });
    expect(plan.steps.map((s) => s.action)).toEqual(['createVault', 'approve', 'approve']);
    const link = atro.handoff.link(plan, 'https://x.test');
    const blocked = await atro.handoff.inspect(link);
    expect(blocked.steps.every((s) => s.allowed && s.simulation.ok === true)).toBe(true);
    expect(blocked.ok).toBe(false);
    expect(blocked.confirm?.addresses.map((a) => [a.role, a.account, a.bps])).toEqual([
      ['heir', HEIR, 7000],
      ['heir', HEIR2, 3000],
      ['guardian', G1, null],
      ['guardian', G2, null],
      ['guardian', HEIR2, null],
    ]);
    const create = blocked.steps[0].create;
    const now = (await env.publicClient.getBlock()).timestamp;
    expect(create).toMatchObject({ vault: plan.vault, drill: true, k: 2, recoveryEnabled: true, readAt: now });
    // drill preset: two votes open a 2-minute window; the heirs need 2 missed minutes plus the window.
    expect(create?.exit.routes.map((r) => [r.route, r.after])).toEqual([
      ['recovery', 120],
      ['heirs', 240],
      ['heirsFallback', 900],
    ]);
    expect(create?.earliestAt).toBe(now + 120n);
    expect(blocked.steps[0].warnings.map((w) => w.code)).toEqual(['RECOVERY_POWER', 'DRILL_NOT_FOR_REAL_ASSETS']);
    const typed = [HEIR.toLowerCase(), HEIR2, G1, G2, HEIR2];
    const check = await atro.handoff.inspect(link, { confirmed: typed });
    expect(check.ok).toBe(true);
    expect(check.confirm?.confirmed).toBe(true);
  });

  it('holds an approval link to a Drill vault already on chain the same way', async () => {
    const plan = await atro.prepare.createVault(guarded, { owner: OWNER, drill: true });
    await sendPlanRaw(env, plan);
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [plan.vault, 10n ** 30n] });
    const more = { chainId: 31337, from: OWNER, steps: [{ to: usdt0, data: approve, value: 0n }] };
    const check = await atro.handoff.inspect(more);
    expect(check.steps[0]).toMatchObject({ allowed: true, simulation: { ok: true } });
    expect(check.ok).toBe(false);
    expect(check.confirm?.addresses.map((a) => a.account)).toEqual([HEIR, HEIR2, G1, G2, HEIR2]);
    expect((await atro.handoff.inspect(more, { confirmed: [HEIR, HEIR2, G1, G2, HEIR2] })).ok).toBe(true);
  });

  it('holds our own set-heirs link for a Drill on chain until the new heirs are typed again', async () => {
    const plan = await atro.prepare.createVault(guarded, { owner: OWNER, drill: true });
    await sendPlanRaw(env, plan);
    const heirs = [
      { account: STRANGER, percent: 70 },
      { account: HEIR2, percent: 30 },
    ];
    const change = await atro.vault(plan.vault).prepare({ type: 'setHeirs', heirs }, { as: OWNER });
    const link = atro.handoff.link(change, 'https://x.test');
    const check = await atro.handoff.inspect(link);
    expect(check.steps[0]).toMatchObject({ allowed: true, action: 'setHeirs', simulation: { ok: true } });
    expect(check.ok).toBe(false);
    expect(check.confirm?.reason).toBe('DRILL_RECIPIENTS_CHANGED');
    expect(check.confirm?.addresses.map((a) => [a.role, a.account])).toEqual([
      ['heir', STRANGER],
      ['heir', HEIR2],
      ['guardian', G1],
      ['guardian', G2],
      ['guardian', HEIR2],
    ]);
    const typed = [STRANGER, HEIR2, G1, G2, HEIR2];
    expect((await atro.handoff.inspect(link, { confirmed: typed })).ok).toBe(true);
  });

  it('refuses a link that calls the vault it creates, as our own links never do', async () => {
    const plan = await atro.prepare.createVault(
      { ...guarded, timing: 'sixMonths' },
      { owner: OWNER, drill: false, feeToken: usdc },
    );
    const p = toPayload(plan);
    const create = p.steps.findIndex((s) => s.to.toLowerCase() === env.deployment.factory.toLowerCase());
    expect(p.steps.filter((s) => s.to.toLowerCase() === plan.vault.toLowerCase())).toEqual([]);
    const data = encodeFunctionData({
      abi: vaultAbi,
      functionName: 'setHeirs',
      args: [[{ account: STRANGER, bps: 10_000 }]],
    });
    const check = await atro.handoff.inspect({ ...p, steps: [...p.steps, { to: plan.vault, data, value: 0n }] });
    expect(check.ok).toBe(false);
    expect(check.steps.at(-1)?.reason).toContain(`step ${create + 1} creates vault ${plan.vault}`);
    expect(check.steps[create].create?.heirs.map((h) => h.account)).toEqual([HEIR, HEIR2]);
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
