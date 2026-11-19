import { erc20Abi, erc721Abi, type Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS } from '../../../../scripts/lib/anvil';
import { seedDevnet } from '../../../../scripts/lib/seed';
import { createAtropyle, type PlanInput, parseBuilderCodeSuffix } from '../../src/index';
import { devnet, revertChain, snapshotChain, walletOf, warp } from './helpers';

const [, OWNER, HEIR, , , HEIR2, , , STRANGER] = ANVIL_ACCOUNTS;

describe('send on the devnet', () => {
  const env = devnet();
  const atro = createAtropyle({ chain: env.deployment, builderCode: 'atropyle-test' });
  const drillPlan: PlanInput = {
    heirs: [{ account: HEIR }],
    timing: 'drill',
    assets: [{ kind: 'erc20', token: env.deployment.feeTokens[0] }],
  };
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(env.rpcUrl);
  });
  afterEach(async () => {
    await revertChain(env.rpcUrl, id);
  });

  it('sends every step in order and decodes the events; the suffix does not break the calls', async () => {
    const plan = await atro.prepare.createVault(drillPlan, { owner: OWNER, drill: true });
    const phases: string[] = [];
    const r = await atro.send(plan, walletOf(env.rpcUrl, OWNER), {
      onStep: (e) => phases.push(`${e.index}:${e.phase}`),
    });
    expect(r.vault).toBe(plan.vault);
    expect(r.steps.map((s) => s.action)).toEqual(['createVault', 'approve']);
    expect(phases).toEqual(['0:signing', '0:pending', '0:confirmed', '1:signing', '1:pending', '1:confirmed']);
    expect(r.steps[0].events.map((e) => e.name)).toEqual(expect.arrayContaining(['VaultCreated', 'Alive']));
    const tx = await env.publicClient.getTransaction({ hash: r.steps[0].hash });
    expect(parseBuilderCodeSuffix(tx.input)?.codes).toEqual(['atropyle-test']);
    const s = await atro.vault(plan.vault).status();
    expect(s.state).toBe('active');
    expect(s.assets[0].coverage).toBe(10_000_000_000n);
  });

  it('refuses the wrong account, the wrong chain and steps known to revert', async () => {
    const plan = await atro.prepare.createVault(drillPlan, { owner: OWNER, drill: true });
    await expect(atro.send(plan, walletOf(env.rpcUrl, STRANGER))).rejects.toMatchObject({ code: 'WRONG_ACCOUNT' });
    await expect(atro.send({ ...plan, chainId: 196 }, walletOf(env.rpcUrl, OWNER))).rejects.toMatchObject({
      code: 'WRONG_CHAIN',
    });
    await atro.send(plan, walletOf(env.rpcUrl, OWNER));
    // createVault is simulated again right before sending: the vault now exists, so nothing is sent.
    const ownerNonce = await env.publicClient.getTransactionCount({ address: OWNER });
    await expect(atro.send(plan, walletOf(env.rpcUrl, OWNER))).rejects.toMatchObject({
      details: { index: 0, completed: 0 },
    });
    expect(await env.publicClient.getTransactionCount({ address: OWNER })).toBe(ownerNonce);
    const bad = await atro.vault(plan.vault).prepare({ type: 'checkIn' }, { as: STRANGER });
    const nonce = await env.publicClient.getTransactionCount({ address: STRANGER });
    await expect(atro.send(bad, walletOf(env.rpcUrl, STRANGER))).rejects.toMatchObject({
      code: 'NOT_OWNER',
      details: { index: 0, completed: 0 },
    });
    expect(await env.publicClient.getTransactionCount({ address: STRANGER })).toBe(nonce);
  });

  it('seeds the three demo vaults', async () => {
    const seeded = await seedDevnet(env.rpcUrl, env.deployment);
    expect((await atro.vault(seeded.simple).status()).state).toBe('active');
    expect((await atro.vault(seeded.guarded).config()).guardians).toHaveLength(3);
    expect((await atro.vault(seeded.grace).status()).state).toBe('grace');
  });

  it('sends distribute with the simulated gas times 1.3 while the vault holds an ERC-20 and an ERC-721', async () => {
    const [usdt0] = env.deployment.feeTokens;
    const nft = env.deployment.mocks?.nft;
    if (!nft) throw new Error('the local deployment has no mock NFT');
    const plan = await atro.prepare.createVault(
      {
        heirs: [
          { account: HEIR, percent: 70 },
          { account: HEIR2, percent: 30 },
        ],
        timing: 'drill',
        assets: [
          { kind: 'erc20', token: usdt0 },
          { kind: 'erc721', token: nft, id: 2, heir: 1 },
        ],
      },
      { owner: OWNER, drill: true },
    );
    await atro.send(plan, walletOf(env.rpcUrl, OWNER));
    const balanceOf = (account: string) =>
      env.publicClient.readContract({
        address: usdt0,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account as never],
      });
    const [before, before2] = [await balanceOf(HEIR), await balanceOf(HEIR2)];

    // A poke after the alarm moves the vault to grace; one more window of silence and the next poke releases it.
    for (const _ of [1, 2]) {
      await warp(env.rpcUrl, 130);
      const poke = await atro.vault(plan.vault).prepare({ type: 'poke' }, { as: STRANGER });
      await atro.send(poke, walletOf(env.rpcUrl, STRANGER));
    }
    expect((await atro.vault(plan.vault).status()).state).toBe('releasedInherit');

    // The sweep checks its gas before every transfer (_requireGas), so a limit that is too tight reverts it.
    const distribute = await atro.vault(plan.vault).prepare({ type: 'distribute' }, { as: STRANGER });
    const sim = distribute.steps[0].simulation;
    if (sim.ok !== true) throw new Error('distribute should simulate');
    const sent = await atro.send(distribute, walletOf(env.rpcUrl, STRANGER));
    const tx = await env.publicClient.getTransaction({ hash: sent.steps[0].hash });
    expect(tx.gas).toBe((sim.gas * 130n) / 100n);
    const names = sent.steps[0].events.map((e) => e.name);
    expect(names.filter((n) => n === 'Distributed')).toHaveLength(3);
    expect(names).not.toContain('TransferFailed');
    expect(await balanceOf(HEIR)).toBe(before + 7_000_000_000n);
    expect(await balanceOf(HEIR2)).toBe(before2 + 3_000_000_000n);
    expect(
      await env.publicClient.readContract({ address: nft, abi: erc721Abi, functionName: 'ownerOf', args: [2n] }),
    ).toBe(HEIR2);
  });
});
