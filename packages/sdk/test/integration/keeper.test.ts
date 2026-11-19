import { erc20Abi, type Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS, rpc } from '../../../../scripts/lib/anvil';
import { createAtropyle, keeperTick, type PlanInput } from '../../src/index';
import { devnet, revertChain, sendPlanRaw, snapshotChain, walletOf, warp } from './helpers';

const [, OWNER, HEIR, , , , , KEEPER] = ANVIL_ACCOUNTS;

describe('keeper on the devnet (spec §12.2)', () => {
  const env = devnet();
  const atro = createAtropyle({ chain: env.deployment, builderCode: null });
  const usdt0 = env.deployment.feeTokens[0];
  const drillPlan: PlanInput = {
    heirs: [{ account: HEIR }],
    timing: 'drill',
    assets: [{ kind: 'erc20', token: usdt0 }],
  };
  const balanceOf = (a: `0x${string}`) =>
    env.publicClient.readContract({ address: usdt0, abi: erc20Abi, functionName: 'balanceOf', args: [a] });
  const keeper = () => walletOf(env.rpcUrl, KEEPER);
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(env.rpcUrl);
  });
  afterEach(async () => {
    await revertChain(env.rpcUrl, id);
  });

  async function newDrill() {
    const plan = await atro.prepare.createVault(drillPlan, { owner: OWNER, drill: true });
    await sendPlanRaw(env, plan);
    return plan.vault;
  }

  it('raises the alarm after lateAt and pays the heir after the window, with nobody else acting', async () => {
    const vault = await newDrill();
    const s0 = await atro.vault(vault).status();
    const first = await keeperTick(atro, [vault], { wallet: keeper() });
    expect(first.outcomes[0]).toMatchObject({
      status: 'idle',
      decision: { reason: 'WAITING' },
      nextCheckAt: s0.lateAt,
    });

    await warp(env.rpcUrl, Number(s0.lateAt - s0.blockTimestamp));
    const alarm = await keeperTick(atro, [vault], { wallet: keeper() });
    expect(alarm.outcomes[0]).toMatchObject({ status: 'sent', decision: { action: 'poke', reason: 'TRANSITION_DUE' } });
    const s1 = await atro.vault(vault).status();
    expect(s1.state).toBe('grace');

    await warp(env.rpcUrl, Number((s1.windowEndsAt as bigint) - s1.blockTimestamp));
    const before = await balanceOf(HEIR);
    const release = await keeperTick(atro, [vault], { wallet: keeper() });
    expect(release.outcomes[0]).toMatchObject({
      status: 'sent',
      decision: { action: 'distribute', reason: 'RELEASE_DUE' },
    });
    expect((await balanceOf(HEIR)) - before).toBe(10_000_000_000n);
    expect((await atro.vault(vault).status()).state).toBe('releasedInherit');

    const done = await keeperTick(atro, [vault], { wallet: keeper() });
    expect(done.outcomes[0].decision?.reason).toBe('DONE');
    expect(done.sent).toBe(0);
  });

  it('dry run sends nothing, the cap holds and expired drills are dropped', async () => {
    const vaults = [await newDrill(), await newDrill(), await newDrill()];
    await warp(env.rpcUrl, 130);
    const dry = await keeperTick(atro, vaults);
    expect(dry.dryRun).toBe(true);
    expect(dry.outcomes.map((o) => o.status)).toEqual(['dry-run', 'dry-run', 'dry-run']);
    expect((await atro.vault(vaults[0]).status()).state).toBe('active');

    const capped = await keeperTick(atro, vaults, { wallet: keeper(), maxTx: 2 });
    expect(capped.outcomes.map((o) => o.status)).toEqual(['sent', 'sent', 'limit']);
    expect(capped.outcomes[2].nextCheckAt).toBe(capped.outcomes[2].decision?.nextCheckAt);

    await warp(env.rpcUrl, 7 * 86400 + 1);
    const expired = await keeperTick(atro, [vaults[2]], { wallet: keeper() });
    expect(expired.outcomes[0]).toMatchObject({ status: 'idle', decision: { reason: 'EXPIRED' }, nextCheckAt: null });
    expect(expired.sent).toBe(0);
  });

  it('stops entirely when the keeper wallet is low on gas', async () => {
    const vault = await newDrill();
    await warp(env.rpcUrl, 130);
    await rpc(env.rpcUrl, 'anvil_setBalance', [KEEPER, '0x38d7ea4c68000']); // 0.001 ETH
    const r = await keeperTick(atro, [vault], { wallet: keeper() });
    expect(r).toMatchObject({ stopped: 'LOW_BALANCE', sent: 0, outcomes: [], balance: 1_000_000_000_000_000n });
    expect((await atro.vault(vault).status()).state).toBe('active');
  });

  it('skips a vault over maxGas without sending, and sends it once the cap allows', async () => {
    const vault = await newDrill();
    await warp(env.rpcUrl, 130);
    const capped = await keeperTick(atro, [vault], { wallet: keeper(), maxGas: 1n });
    expect(capped).toMatchObject({ sent: 0, outcomes: [{ status: 'gas-cap', nextCheckAt: capped.ranAt + 300n }] });
    expect((await atro.vault(vault).status()).state).toBe('active');
    expect((await keeperTick(atro, [vault], { wallet: keeper() })).sent).toBe(1);
  });

  it('never checks the owner in when the keeper runs with the owner wallet', async () => {
    const vault = await newDrill();
    const s0 = await atro.vault(vault).status();
    await warp(env.rpcUrl, Number(s0.lateAt - s0.blockTimestamp));
    const r = await keeperTick(atro, [vault], { wallet: walletOf(env.rpcUrl, OWNER) });
    expect(r).toMatchObject({
      sent: 0,
      outcomes: [{ status: 'owner-wallet', error: { code: 'WRONG_ACCOUNT' }, decision: { action: 'poke' } }],
    });
    expect((await atro.vault(vault).status()).lastAlive).toBe(s0.lastAlive);
  });

  it('records a vault that is not a vault as read-failed and never looks at it again', async () => {
    const r = await keeperTick(atro, [env.deployment.factory], { wallet: keeper() });
    expect(r.outcomes[0]).toMatchObject({ status: 'read-failed', nextCheckAt: null });
  });
});
