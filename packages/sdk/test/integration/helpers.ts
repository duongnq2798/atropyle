// Integration-test helpers over the anvil devnet started by global-setup.ts.
//
// Rule: every integration test file reverts the anvil snapshots it takes (snapshotChain in beforeAll or
// beforeEach, revertChain in afterAll or afterEach), so each file sees a clean chain whatever ran before it.
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  type Hex,
  http,
  keccak256,
  type PublicClient,
  parseEventLogs,
  type TransactionReceipt,
  toHex,
  type WalletClient,
} from 'viem';
import { inject } from 'vitest';
import { rpc } from '../../../../scripts/lib/anvil';
import { factoryAbi } from '../../src/abi/index';
import { paramsToAbi } from '../../src/encode';
import { type Deployment, parseDeployment, type VaultParams, ZERO_ADDRESS } from '../../src/index';

export { increaseTime as warp } from '../../../../scripts/lib/anvil';

export const anvilChain = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

export function devnet(): { rpcUrl: string; deployment: Deployment; publicClient: PublicClient } {
  const rpcUrl = inject('rpcUrl');
  const deployment = parseDeployment(inject('deployment'));
  const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) });
  return { rpcUrl, deployment, publicClient };
}

/** A wallet for one of anvil's unlocked accounts: transactions go out as eth_sendTransaction, no key involved. */
export function walletOf(rpcUrl: string, account: Address): WalletClient {
  return createWalletClient({ account, chain: anvilChain, transport: http(rpcUrl) });
}

export async function snapshotChain(url: string): Promise<Hex> {
  return (await rpc(url, 'evm_snapshot')) as Hex;
}

export async function revertChain(url: string, id: Hex): Promise<void> {
  await rpc(url, 'evm_revert', [id]);
}

export type Env = ReturnType<typeof devnet>;

/**
 * Sends a transaction from an unlocked account and waits for it. anvil's eth_estimateGas comes out a little too low
 * for vault calls (a checkIn is estimated at 61161 gas and runs out of gas at that limit), so the limit gets 50%
 * headroom. The estimate still runs first, so a call that would revert fails here with its decoded reason.
 */
export async function sendRaw(env: Env, tx: { from: Address; to: Address; data: Hex }): Promise<TransactionReceipt> {
  const estimate = await env.publicClient.estimateGas({ account: tx.from, to: tx.to, data: tx.data });
  const hash = await walletOf(env.rpcUrl, tx.from).sendTransaction({
    account: tx.from,
    chain: anvilChain,
    to: tx.to,
    data: tx.data,
    gas: (estimate * 3n) / 2n,
  });
  const r = await env.publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`transaction ${hash} reverted`);
  return r;
}

export async function createVaultRaw(
  env: Env,
  o: { owner: Address; params: VaultParams; drill?: boolean; salt?: Hex; feeToken?: Address },
): Promise<Address> {
  const salt = o.salt ?? keccak256(toHex(`${Date.now()}-${Math.random()}`));
  const data = encodeFunctionData({
    abi: factoryAbi,
    functionName: 'createVault',
    args: [paramsToAbi(o.params), salt, o.drill ?? true, o.feeToken ?? ZERO_ADDRESS],
  });
  const r = await sendRaw(env, { from: o.owner, to: env.deployment.factory, data });
  const [ev] = parseEventLogs({ abi: factoryAbi, logs: r.logs, eventName: 'VaultCreated' });
  return ev.args.vault;
}
