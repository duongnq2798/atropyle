import { type Address, createWalletClient, http, keccak256, toHex } from 'viem';
import { createAtropyle, type Deployment, type PlanInput } from '../../packages/sdk/src/index';
import { ANVIL_ACCOUNTS, increaseTime } from './anvil';

export interface SeededVaults {
  simple: Address;
  guarded: Address;
  grace: Address;
}

/** Spec §10.3: a Simple Drill, a Guarded Drill and a Drill already in Grace, sent through unlocked anvil accounts. */
export async function seedDevnet(rpcUrl: string, deployment: Deployment): Promise<SeededVaults> {
  const atro = createAtropyle({
    chain: { ...deployment, rpcUrls: [rpcUrl], quorumRpcUrls: [[rpcUrl]] },
    builderCode: null,
  });
  const [, owner, heirA, g1, g2, heirB, , poker] = ANVIL_ACCOUNTS as unknown as Address[];
  const wallet = (account: Address) => createWalletClient({ account, chain: atro.chain, transport: http(rpcUrl) });
  const [usdt0, usdc, usdg] = deployment.feeTokens;
  const nft = deployment.mocks?.nft;
  if (!nft) throw new Error('the local deployment has no mock NFT');

  async function create(plan: PlanInput, name: string): Promise<Address> {
    const tx = await atro.prepare.createVault(plan, { owner, drill: true, salt: keccak256(toHex(`seed:${name}`)) });
    await atro.send(tx, wallet(owner));
    return tx.vault;
  }

  const grace = await create(
    atro.plan.template('simple', {
      heirs: [{ account: heirA }],
      drill: true,
      assets: [{ kind: 'erc20', token: usdg }],
    }),
    'grace',
  );
  await increaseTime(rpcUrl, 130);
  await atro.send(await atro.vault(grace).prepare({ type: 'poke' }, { as: poker }), wallet(poker));

  const simple = await create(
    atro.plan.template('simple', {
      heirs: [{ account: heirA }],
      drill: true,
      assets: [{ kind: 'erc20', token: usdt0 }],
    }),
    'simple',
  );
  const guarded = await create(
    atro.plan.template('guarded', {
      heirs: [
        { account: heirA, percent: 70 },
        { account: heirB, percent: 30 },
      ],
      guardians: [g1, g2, heirB],
      drill: true,
      assets: [
        { kind: 'erc20', token: usdc },
        { kind: 'erc721', token: nft, id: 2, heir: 1 },
      ],
    }),
    'guarded',
  );
  return { simple, guarded, grace };
}
