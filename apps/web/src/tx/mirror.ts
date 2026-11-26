import type { Address } from 'viem';
import { sameAddress } from '@/lib/address';
import type { Untrusted } from '@/lib/untrusted';

export type AssetKind = 'erc20' | 'erc721' | 'erc1155';

/**
 * An asset the plan touches, as the page knows it: the kind from the vault's asset list (the createVault plan, the
 * vault snapshot, or inspect on /sign/), the symbol and decimals read from the chain. The kind is never guessed
 * from chain text (R18.8).
 */
export interface MirrorToken {
  address: Address;
  kind: AssetKind;
  symbol: Untrusted | string | null;
  decimals: number | null;
}

/** Who a contract is to this plan: the deployment's factory, the plan's vault, an asset of the plan, a fee token. */
export type ContractRole = 'factory' | 'vault' | 'token' | 'feeToken' | 'other';

/**
 * An approval decoded from calldata. The same selector means an ERC-20 allowance or an ERC-721 approval; the kind
 * comes from the asset list matched by `to` (the rule of atro.handoff.inspect). `unknown`: the list does not say.
 */
export type ApprovalRow =
  | { kind: 'erc20'; spender: Address; spenderRole: ContractRole; amount: bigint; unlimited: boolean }
  | { kind: 'erc721'; spender: Address; spenderRole: ContractRole; id: bigint }
  | { kind: 'all'; operator: Address; spenderRole: ContractRole; on: boolean }
  | { kind: 'unknown'; spender: Address; spenderRole: ContractRole; raw: bigint };

/** One call as the wallet should show it, decoded from its bytes; the step's summary plays no part. */
export interface MirrorCall {
  index: number;
  chainId: number;
  to: Address;
  role: ContractRole;
  /** The function the selector names, or the selector itself when this page does not know it. */
  fn: string;
  /** The selector is known and its arguments decoded. */
  known: boolean;
  value: bigint;
  approval: ApprovalRow | null;
  /** The asset `to` names, when the plan lists it. */
  token: MirrorToken | null;
  /** voteRecovery: the wallet the vote names; the zero address takes the vote back. */
  vote: Address | null;
}

export interface MirrorContext {
  factory: Address;
  feeTokens: readonly Address[];
  tokens: readonly MirrorToken[];
}

export const ZERO: Address = '0x0000000000000000000000000000000000000000';

export const isZero = (a: string): boolean => sameAddress(a, ZERO);

export function approvalSpender(a: ApprovalRow): Address {
  return a.kind === 'all' ? a.operator : a.spender;
}

/** A revocation: an allowance of 0, an NFT approval to the zero address, or setApprovalForAll(…, false). */
export function isRevoke(a: ApprovalRow): boolean {
  switch (a.kind) {
    case 'erc20':
      return a.amount === 0n;
    case 'erc721':
      return isZero(a.spender);
    case 'all':
      return !a.on;
    case 'unknown':
      return false;
  }
}

export type MirrorDanger = 'unlimited' | 'all' | 'unknownSpender' | 'unknownContract' | 'unknownCall';

/** The lines the box draws in the danger tone, in this order. */
export function mirrorDangers(c: MirrorCall): MirrorDanger[] {
  const out: MirrorDanger[] = [];
  const a = c.approval;
  if (a?.kind === 'erc20' && a.unlimited) out.push('unlimited');
  if (a?.kind === 'all' && a.on) out.push('all');
  // A grant to anyone but this vault or the factory is how an approval scam looks.
  if (a && !isRevoke(a) && a.spenderRole !== 'vault' && a.spenderRole !== 'factory') out.push('unknownSpender');
  if (c.role === 'other') out.push('unknownContract');
  if (!c.known || a?.kind === 'unknown') out.push('unknownCall');
  return out;
}
