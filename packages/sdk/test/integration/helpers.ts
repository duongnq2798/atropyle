// Integration-test helpers over the anvil devnet started by global-setup.ts.
//
// Rule: every integration test file reverts the anvil snapshots it takes (snapshotChain in beforeAll or
// beforeEach, revertChain in afterAll or afterEach), so each file sees a clean chain whatever ran before it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  type Abi,
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  type Hex,
  http,
  keccak256,
  type PublicClient,
  parseEventLogs,
  type TransactionReceipt,
  toFunctionSelector,
  toHex,
  type WalletClient,
} from 'viem';
import { inject } from 'vitest';
import { rpc } from '../../../../scripts/lib/anvil';
import { factoryAbi } from '../../src/abi/index';
import { paramsToAbi } from '../../src/encode';
import { type Deployment, parseDeployment, type TxPlan, type VaultParams, ZERO_ADDRESS } from '../../src/index';

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

/** Sends every step of a prepared plan in order, each from the account that must sign it. */
export async function sendPlanRaw(env: Env, plan: TxPlan): Promise<TransactionReceipt[]> {
  const out: TransactionReceipt[] = [];
  for (const s of plan.steps) out.push(await sendRaw(env, { from: s.from, to: s.to, data: s.data }));
  return out;
}

/** Deploys contracts/out/Tokens.sol/MockERC20 with any name, e.g. a prompt-injection string. */
export async function deployToken(env: Env, name: string, symbol: string, decimals: number): Promise<Address> {
  const file = fileURLToPath(new URL('../../../../contracts/out/Tokens.sol/MockERC20.json', import.meta.url));
  const art = JSON.parse(readFileSync(file, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  const deployer = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
  const hash = await walletOf(env.rpcUrl, deployer).deployContract({
    abi: art.abi,
    bytecode: art.bytecode.object,
    args: [name, symbol, decimals],
    account: deployer,
    chain: anvilChain,
  });
  const r = await env.publicClient.waitForTransactionReceipt({ hash });
  return r.contractAddress as Address;
}

/** Jump table assembler: '@x' is a JUMPDEST labelled x, '#x' a label without code, '>x' a PUSH2 of the offset of x. */
function assemble(parts: string[]): Hex {
  const offsets = new Map<string, number>();
  const size = (p: string) => (p.startsWith('@') ? 1 : p.startsWith('#') ? 0 : p.startsWith('>') ? 3 : p.length / 2);
  let at = 0;
  for (const p of parts) {
    if (p.startsWith('@') || p.startsWith('#')) offsets.set(p.slice(1), at);
    at += size(p);
  }
  const hex = parts.map((p) => {
    if (p.startsWith('@')) return '5b';
    if (p.startsWith('#')) return '';
    if (p.startsWith('>')) return `61${(offsets.get(p.slice(1)) as number).toString(16).padStart(4, '0')}`;
    return p;
  });
  return `0x${hex.join('')}`;
}

/**
 * Puts a token at a fixed address (anvil_setCode) whose approve() always reverts with Error(reason), so a test can
 * choose the revert text. balanceOf is 5,000,000, allowance 1, decimals 6; every other call reverts without data.
 * Hand-assembled because no mock in contracts/ reverts with a reason of its own.
 */
export async function etchApproveReverter(env: Env, reason: string): Promise<Address> {
  const address = getAddress('0x000000000000000000000000000000000000bad1');
  const payload = `08c379a0${encodeAbiParameters([{ type: 'string' }], [reason]).slice(2)}`;
  const length = (payload.length / 2).toString(16).padStart(4, '0');
  const answer = (value: string) => [`62${value.padStart(6, '0')}`, '600052', '60206000f3'];
  const whenSelector = (signature: string, label: string) => [
    '80',
    `63${toFunctionSelector(signature).slice(2)}`,
    '14',
    `>${label}`,
    '57',
  ];
  const code = assemble([
    ...['600035', '60e0', '1c'],
    ...whenSelector('approve(address,uint256)', 'approve'),
    ...whenSelector('balanceOf(address)', 'balance'),
    ...whenSelector('decimals()', 'decimals'),
    ...whenSelector('allowance(address,address)', 'allowance'),
    ...['6000', '80', 'fd'],
    '@balance',
    ...answer('4c4b40'),
    '@decimals',
    ...answer('06'),
    '@allowance',
    ...answer('01'),
    '@approve',
    `61${length}`,
    '>data',
    '6000',
    '39',
    `61${length}`,
    '6000',
    'fd',
    '#data',
    payload,
  ]);
  await rpc(env.rpcUrl, 'anvil_setCode', [address, code]);
  return address;
}
