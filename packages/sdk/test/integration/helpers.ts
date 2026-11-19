// Integration-test helpers over the anvil devnet started by global-setup.ts.
//
// Rule: every integration test file reverts the anvil snapshots it takes (snapshotChain in beforeAll or
// beforeEach, revertChain in afterAll or afterEach), so each file sees a clean chain whatever ran before it.
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { inject } from 'vitest';
import { rpc } from '../../../../scripts/lib/anvil';
import { type Deployment, parseDeployment } from '../../src/index';

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
