import { erc1155Abi, factoryAbi, type TxPlan, vaultAbi } from '@atropyle/sdk';
import {
  type Abi,
  type AbiFunction,
  type Address,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  type Hex,
  maxUint256,
  toFunctionSelector,
} from 'viem';
import { sameAddress } from '@/lib/address';
import type { ApprovalRow, AssetKind, ContractRole, MirrorCall, MirrorContext } from '../mirror';

const APPROVE = '0x095ea7b3';
const SET_APPROVAL_FOR_ALL = '0xa22cb465';

/** Every write an Atropyle plan can call, by selector: the vault's, the factory's and the token approvals. */
export const FUNCTIONS: ReadonlyMap<string, string> = new Map(
  ([...vaultAbi, ...factoryAbi, ...erc20Abi, ...erc1155Abi] as Abi)
    .filter(
      (f): f is AbiFunction => f.type === 'function' && f.stateMutability !== 'view' && f.stateMutability !== 'pure',
    )
    .map((f) => [toFunctionSelector(f), f.name] as const),
);

function roleOf(a: Address, plan: TxPlan, c: MirrorContext): ContractRole {
  if (sameAddress(a, c.factory)) return 'factory';
  if (sameAddress(a, plan.vault)) return 'vault';
  if (c.tokens.some((t) => sameAddress(t.address, a))) return 'token';
  if (c.feeTokens.some((t) => sameAddress(t, a))) return 'feeToken';
  return 'other';
}

/** The asset list first; a fee token of the deployment is an ERC-20. Never from chain text. */
function kindOf(to: Address, c: MirrorContext): AssetKind | null {
  const listed = c.tokens.find((t) => sameAddress(t.address, to));
  if (listed) return listed.kind;
  return c.feeTokens.some((t) => sameAddress(t, to)) ? 'erc20' : null;
}

/** null: not an approval. 'unreadable': an approval selector whose arguments do not decode. */
function approvalOf(data: Hex, to: Address, plan: TxPlan, c: MirrorContext): ApprovalRow | null | 'unreadable' {
  const selector = data.slice(0, 10).toLowerCase();
  if (selector !== APPROVE && selector !== SET_APPROVAL_FOR_ALL) return null;
  try {
    if (selector === APPROVE) {
      const { args } = decodeFunctionData({ abi: erc20Abi, data });
      const [raw, amount] = args as readonly [Address, bigint];
      const spender = getAddress(raw);
      const spenderRole = roleOf(spender, plan, c);
      const kind = kindOf(to, c);
      if (kind === 'erc20') return { kind: 'erc20', spender, spenderRole, amount, unlimited: amount === maxUint256 };
      if (kind === 'erc721') return { kind: 'erc721', spender, spenderRole, id: amount };
      return { kind: 'unknown', spender, spenderRole, raw: amount };
    }
    const { args } = decodeFunctionData({ abi: erc1155Abi, data });
    const [raw, on] = args as readonly [Address, boolean];
    const operator = getAddress(raw);
    return { kind: 'all', operator, spenderRole: roleOf(operator, plan, c), on };
  } catch {
    return 'unreadable';
  }
}

function voteOf(data: Hex): Address | null {
  try {
    const call = decodeFunctionData({ abi: vaultAbi, data });
    return call.functionName === 'voteRecovery' ? getAddress(call.args[0] as Address) : null;
  } catch {
    return null;
  }
}

/**
 * What each step asks the wallet, decoded from its calldata (R18.8): function, contract and its role, value and any
 * approval. Trailing bytes after the arguments (the ERC-8021 builder code) are ignored, as the ABI decoder does.
 */
export function mirrorPlan(plan: TxPlan, c: MirrorContext): MirrorCall[] {
  return plan.steps.map((s, index): MirrorCall => {
    const selector = s.data.length >= 10 ? s.data.slice(0, 10).toLowerCase() : null;
    const name = selector === null ? undefined : FUNCTIONS.get(selector);
    const decoded = approvalOf(s.data, s.to, plan, c);
    const approval = decoded === 'unreadable' ? null : decoded;
    return {
      index,
      chainId: s.chainId,
      to: getAddress(s.to),
      role: roleOf(s.to, plan, c),
      fn: name ?? selector ?? s.data,
      known: name !== undefined && decoded !== 'unreadable',
      value: s.value,
      approval,
      token: approval ? (c.tokens.find((t) => sameAddress(t.address, s.to)) ?? null) : null,
      vote: name === 'voteRecovery' ? voteOf(s.data) : null,
    };
  });
}
