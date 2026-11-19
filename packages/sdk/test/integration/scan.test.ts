import { encodeFunctionData, type Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS } from '../../../../scripts/lib/anvil';
import { vaultAbi } from '../../src/abi/index';
import { createAtropyle, type PlanInput } from '../../src/index';
import { devnet, revertChain, sendPlanRaw, sendRaw, snapshotChain, warp } from './helpers';

const [, OWNER, HEIR, , , , , POKER] = ANVIL_ACCOUNTS;

describe('scanEvents (cron source, spec §9.5)', () => {
  const env = devnet();
  const atro = createAtropyle({ chain: env.deployment, builderCode: null });
  const usdt0 = env.deployment.feeTokens[0];
  const drillPlan: PlanInput = {
    heirs: [{ account: HEIR }],
    timing: 'drill',
    assets: [{ kind: 'erc20', token: usdt0 }],
  };
  const lower = (a: string) => a.toLowerCase();
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(env.rpcUrl);
  });
  afterEach(async () => {
    await revertChain(env.rpcUrl, id);
  });

  it('returns the creation, the first Alive of the same transaction, and only newer events on resume', async () => {
    const start = (await env.publicClient.getBlockNumber()) + 1n;
    const plan = await atro.prepare.createVault(drillPlan, { owner: OWNER, drill: true });
    await sendPlanRaw(env, plan);
    const first = await atro.scan({ fromBlock: start });
    expect(first.created.map((c) => lower(c.vault))).toEqual([lower(plan.vault)]);
    expect(lower(first.created[0].owner)).toBe(lower(OWNER));
    expect(first.created[0].drill).toBe(true);
    expect(first.events.map((e) => e.name)).toContain('Alive');
    // The token approval in the same plan is not a vault event, so it is filtered out.
    expect(first.events.every((e) => e.address === plan.vault)).toBe(true);
    expect(first.truncated).toBe(false);

    await warp(env.rpcUrl, 130);
    await sendRaw(env, {
      from: POKER,
      to: plan.vault,
      data: encodeFunctionData({ abi: vaultAbi, functionName: 'poke' }),
    });
    const next = await atro.scan({ resume: first.cursor });
    expect(next.fromBlock).toBe(first.toBlock + 1n);
    expect(next.created).toEqual([]);
    expect(next.events.map((e) => e.name)).toEqual(expect.arrayContaining(['AlarmRaised', 'StateChanged']));
    expect(next.events.some((e) => e.name === 'Alive')).toBe(false);

    const idle = await atro.scan({ resume: next.cursor });
    expect(idle).toMatchObject({ created: [], events: [], cursor: { toBlock: next.toBlock } });
  });

  it('maxBlocks cuts the range and says so', async () => {
    const head = await env.publicClient.getBlockNumber();
    const r = await atro.scan({ fromBlock: head - 9n, maxBlocks: 5 });
    expect(r).toMatchObject({
      fromBlock: head - 9n,
      toBlock: head - 5n,
      truncated: true,
      cursor: { toBlock: head - 5n },
    });
  });

  it('only returns events of vaults the factory created', async () => {
    const plan = await atro.prepare.createVault(drillPlan, { owner: OWNER, drill: true });
    await sendPlanRaw(env, plan);
    const afterCreate = await atro.scan({ fromBlock: 0n });
    await warp(env.rpcUrl, 130);
    await sendRaw(env, {
      from: POKER,
      to: plan.vault,
      data: encodeFunctionData({ abi: vaultAbi, functionName: 'poke' }),
    });
    // A cursor that does not know the vault: its poke events are not a factory vault's, so nothing is returned.
    const r = await atro.scan({ resume: { toBlock: afterCreate.toBlock, vaults: [] } });
    expect(r.events).toEqual([]);
    expect(r.created).toEqual([]);
  });
});
