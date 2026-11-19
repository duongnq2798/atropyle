import { erc20Abi, erc721Abi } from 'viem';
import { factoryAbi, vaultAbi } from './generated';

export { cpuAbi, factoryAbi, vaultAbi } from './generated';
export { erc20Abi, erc721Abi };

export const erc1155Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
] as const;

export const beaconAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;

export const tapeoutFactoryAbi = [
  {
    type: 'function',
    name: 'isCPU',
    stateMutability: 'view',
    inputs: [{ name: 'cpu', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

export const ozErc20ErrorsAbi = [
  {
    type: 'error',
    name: 'ERC20InsufficientAllowance',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'allowance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InsufficientBalance',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'balance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
] as const;

/** Every custom error a vault or factory call can revert with, for decodeErrorResult. */
export const revertAbi = [
  ...vaultAbi.filter((x) => x.type === 'error'),
  ...factoryAbi.filter((x) => x.type === 'error'),
  ...ozErc20ErrorsAbi,
] as const;
