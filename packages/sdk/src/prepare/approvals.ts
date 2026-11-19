import { type Address, encodeFunctionData, erc20Abi, erc721Abi, maxUint256, type PublicClient } from 'viem';
import { erc1155Abi } from '../abi/index';
import { sameAddress, ZERO_ADDRESS } from '../address';
import { decodeError, isContractAnswer } from '../errors';
import { heldBy } from '../read/snapshot';
import type { TokenInfo } from '../read/types';
import type { Asset, Warning } from '../types';
import { summarize } from './summary';
import type { AllowanceMode, Draft } from './types';

export interface ApprovalContext {
  client: PublicClient;
  token(address: Address): Promise<TokenInfo>;
  blockNumber: bigint;
}

/**
 * A token that answers a read with a revert or nothing reads as `fallback`. Any other failure (a throttled or
 * refusing RPC, a method the node does not offer, a malformed response) is rethrown: it says nothing about the
 * token, and reading it as "no approval" or "nothing held" would drop a revocation or an approval from the plan.
 */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (!isContractAnswer(e)) throw decodeError(e);
    return fallback;
  }
}

/** Shared with handoff inspection, so a signing page shows the same warnings as the plan that produced the link. */
export function unlimitedApprovalWarning(token: Address): Warning {
  return {
    code: 'UNLIMITED_APPROVAL',
    message: `The vault may move every unit of ERC-20 token ${token} you will ever hold until you revoke it.`,
  };
}

export function approvalForAllWarning(token: Address): Warning {
  return {
    code: 'APPROVAL_FOR_ALL',
    message: `ERC-1155 approvals cover every token id of ${token}, not only the ones in your plan. Use revokeAll if you cancel the plan.`,
  };
}

function notHeld(index: number, a: Asset): Warning {
  return {
    code: 'TOKEN_NOT_HELD',
    message: `Asset #${index} (${a.kind} ${a.token}${a.kind === 'erc20' ? '' : ` #${a.id}`}) is not held by the owner right now, so no approval is prepared for it.`,
  };
}

/** Approvals so the vault can move each asset at release. Default: exactly the current balance (plan decision 5). */
export async function approvalDrafts(
  x: ApprovalContext,
  owner: Address,
  vault: Address,
  assets: readonly Asset[],
  mode: AllowanceMode,
): Promise<{ drafts: Draft[]; warnings: Warning[] }> {
  const c = x.client;
  const blockNumber = x.blockNumber;
  const drafts: Draft[] = [];
  const warnings: Warning[] = [];
  const forAll = new Set<string>();
  for (const [index, a] of assets.entries()) {
    if (a.kind === 'erc20') {
      const [balance, allowance, info] = await Promise.all([
        heldBy(c, owner, a, blockNumber),
        safe(
          c.readContract({
            address: a.token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [owner, vault],
            blockNumber,
          }),
          0n,
        ),
        x.token(a.token),
      ]);
      if (balance === 0n) {
        warnings.push(notHeld(index, a));
        continue;
      }
      const need = mode === 'unlimited' ? maxUint256 : balance;
      if (allowance >= need) continue;
      drafts.push({
        to: a.token,
        value: 0n,
        action: 'approve',
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [vault, need] }),
        summary: summarize.approve20(vault, a.token, mode === 'unlimited' ? null : need, info.decimals),
        warnings: mode === 'unlimited' ? [unlimitedApprovalWarning(a.token)] : [],
      });
      continue;
    }
    if ((await heldBy(c, owner, a, blockNumber)) === 0n) {
      warnings.push(notHeld(index, a));
      continue;
    }
    // setApprovalForAll and isApprovedForAll have the same selector in ERC-721 and ERC-1155.
    const all = await safe(
      c.readContract({
        address: a.token,
        abi: erc1155Abi,
        functionName: 'isApprovedForAll',
        args: [owner, vault],
        blockNumber,
      }),
      false,
    );
    if (a.kind === 'erc721') {
      const approved = await safe(
        c.readContract({ address: a.token, abi: erc721Abi, functionName: 'getApproved', args: [a.id], blockNumber }),
        ZERO_ADDRESS,
      );
      if (sameAddress(approved, vault) || all) continue;
      drafts.push({
        to: a.token,
        value: 0n,
        action: 'approve',
        data: encodeFunctionData({ abi: erc721Abi, functionName: 'approve', args: [vault, a.id] }),
        summary: summarize.approve721(vault, a.token, a.id),
        warnings: [],
      });
      continue;
    }
    if (all || forAll.has(a.token)) continue;
    forAll.add(a.token);
    drafts.push({
      to: a.token,
      value: 0n,
      action: 'setApprovalForAll',
      data: encodeFunctionData({ abi: erc1155Abi, functionName: 'setApprovalForAll', args: [vault, true] }),
      summary: summarize.approveAll(vault, a.token),
      warnings: [approvalForAllWarning(a.token)],
    });
  }
  return { drafts, warnings };
}

/**
 * Removes every approval the vault holds over the owner's assets. An ERC-20 whose allowance cannot be read (the token
 * reverted) still gets its `approve(vault, 0)`: a revocation is never skipped on a guess.
 */
export async function revokeDrafts(
  x: ApprovalContext,
  owner: Address,
  vault: Address,
  assets: readonly Asset[],
): Promise<Draft[]> {
  const c = x.client;
  const blockNumber = x.blockNumber;
  const drafts: Draft[] = [];
  const forAll = new Set<string>();
  const unsetAll = (token: Address) => {
    forAll.add(token);
    drafts.push({
      to: token,
      value: 0n,
      action: 'setApprovalForAll',
      data: encodeFunctionData({ abi: erc1155Abi, functionName: 'setApprovalForAll', args: [vault, false] }),
      summary: summarize.revokeAll(vault, token),
      warnings: [],
    });
  };
  for (const a of assets) {
    if (a.kind === 'erc20') {
      const allowance = await safe<bigint | null>(
        c.readContract({
          address: a.token,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [owner, vault],
          blockNumber,
        }),
        null,
      );
      if (allowance === 0n) continue;
      drafts.push({
        to: a.token,
        value: 0n,
        action: 'approve',
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [vault, 0n] }),
        summary: summarize.revoke20(vault, a.token),
        warnings: [],
      });
      continue;
    }
    const all = await safe(
      c.readContract({
        address: a.token,
        abi: erc1155Abi,
        functionName: 'isApprovedForAll',
        args: [owner, vault],
        blockNumber,
      }),
      false,
    );
    if (all && !forAll.has(a.token)) unsetAll(a.token);
    if (a.kind === 'erc721') {
      const approved = await safe(
        c.readContract({ address: a.token, abi: erc721Abi, functionName: 'getApproved', args: [a.id], blockNumber }),
        ZERO_ADDRESS,
      );
      if (!sameAddress(approved, vault)) continue;
      drafts.push({
        to: a.token,
        value: 0n,
        action: 'approve',
        data: encodeFunctionData({ abi: erc721Abi, functionName: 'approve', args: [ZERO_ADDRESS, a.id] }),
        summary: summarize.revoke721(vault, a.token, a.id),
        warnings: [],
      });
    }
  }
  return drafts;
}
