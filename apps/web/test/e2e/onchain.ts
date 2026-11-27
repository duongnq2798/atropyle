// Chain setup for e2e tests, from Node through anvil's unlocked accounts (never from the page).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  type Abi,
  type Address,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  type WalletClient,
} from 'viem';
import { anvil } from 'viem/chains';
import type { E2EState } from './state.ts';

const DEPLOYER: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const MOCK_ERC20 = fileURLToPath(new URL('../../../../contracts/out/Tokens.sol/MockERC20.json', import.meta.url));
const MINT_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const publicFor = (state: E2EState) => createPublicClient({ chain: anvil, transport: http(state.rpcUrl) });

export function walletFor(state: E2EState, account: Address): WalletClient {
  return createWalletClient({ account, chain: anvil, transport: http(state.rpcUrl) });
}

/** `MockERC20(name, symbol, decimals)` from contracts/test/mocks/Tokens.sol (Plan 1), built by `forge build`. */
export async function deployMockErc20(
  state: E2EState,
  name: string,
  symbol: string,
  decimals: number,
): Promise<Address> {
  const art = JSON.parse(readFileSync(MOCK_ERC20, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  const hash = await walletFor(state, DEPLOYER).deployContract({
    abi: art.abi,
    bytecode: art.bytecode.object,
    args: [name, symbol, decimals],
    account: DEPLOYER,
    chain: anvil,
  });
  const receipt = await publicFor(state).waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error('MockERC20 was not deployed');
  return receipt.contractAddress;
}

export async function mint(state: E2EState, token: Address, to: Address, amount: bigint): Promise<void> {
  const hash = await walletFor(state, DEPLOYER).writeContract({
    address: token,
    abi: MINT_ABI,
    functionName: 'mint',
    args: [to, amount],
    account: DEPLOYER,
    chain: anvil,
  });
  await publicFor(state).waitForTransactionReceipt({ hash });
}
