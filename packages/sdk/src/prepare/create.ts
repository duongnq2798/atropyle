import { type Address, bytesToHex, encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { factoryAbi } from '../abi/index';
import { sameAddress, toAddress, ZERO_ADDRESS } from '../address';
import { paramsToAbi } from '../encode';
import { AtropyleError } from '../errors';
import { planError, toVaultParams, validatePlan } from '../plan/validate';
import { finalize } from './actions';
import { approvalDrafts } from './approvals';
import { summarize } from './summary';
import type { CreateVaultOptions, Draft, PrepareContext, TxPlan } from './types';

function randomSalt(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}

/** TxPlan: approve the fee (paid vaults), createVault, then approve each asset to the predicted vault. */
export async function prepareCreateVault(x: PrepareContext, plan: unknown, opts: CreateVaultOptions): Promise<TxPlan> {
  const owner = toAddress(opts.owner, 'owner');
  const d = x.deployment;
  const c = x.client;
  const blockNumber = await c.getBlockNumber();
  // A fresh random salt unless the caller pins one. A reused (owner, salt) burns about 63/64 of the gas inside CREATE2
  // and then reverts ERC1167FailedCreateClone, so the predicted address must still be empty.
  const salt = opts.salt ?? randomSalt();
  const vault = await c.readContract({
    address: d.factory,
    abi: factoryAbi,
    functionName: 'predictVault',
    args: [owner, salt],
    blockNumber,
  });
  const code = await c.getCode({ address: vault, blockNumber });
  if (code && code !== '0x') {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: `A vault already exists for this owner and salt (${vault}). Use another salt.`,
    });
  }
  // The vault rejects its own address as an heir or a guardian (address(this)), so validate against the prediction.
  const r = validatePlan(plan, { owner, drill: opts.drill, vault });
  if (!r.ok) throw planError(r.issues);
  const cfg = r.config;
  const drafts: Draft[] = [];
  let fee = 0n;
  let feeToken: Address = ZERO_ADDRESS;
  let feeDecimals: number | null = null;
  if (!cfg.drill) {
    feeToken = toAddress(opts.feeToken ?? d.feeTokens[0], 'feeToken');
    if (!d.feeTokens.some((t) => sameAddress(t, feeToken)))
      throw new AtropyleError('UNSUPPORTED_FEE_TOKEN', { details: { feeToken } });
    const [f, allowance, info] = await Promise.all([
      c.readContract({
        address: d.factory,
        abi: factoryAbi,
        functionName: 'currentFee',
        args: [feeToken],
        blockNumber,
      }),
      c.readContract({
        address: feeToken,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, d.factory],
        blockNumber,
      }),
      x.token(feeToken, blockNumber),
    ]);
    fee = f;
    feeDecimals = info.decimals;
    // Approve exactly currentFee, never more. The price switches from early to full at the 100th paid vault and
    // createVault takes no maxFee, so send() simulates createVault again right before sending it (Task 11).
    if (allowance < fee) {
      drafts.push({
        to: feeToken,
        value: 0n,
        action: 'approve',
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [d.factory, fee] }),
        summary: summarize.approveFee(d.factory, feeToken, fee, feeDecimals),
        warnings: [],
      });
    }
  }
  const createSummary = summarize.createVault(vault, owner, {
    ...toVaultParams(cfg),
    drill: cfg.drill,
    fee,
    feeToken,
    feeDecimals,
  });
  drafts.push({
    to: d.factory,
    value: 0n,
    action: 'createVault',
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: 'createVault',
      args: [paramsToAbi(toVaultParams(cfg)), salt, cfg.drill, feeToken],
    }),
    summary: createSummary,
    // The step carries the plan's warnings too, as handoff inspection rebuilds them from this calldata.
    warnings: r.warnings,
  });
  const ap = await approvalDrafts(
    { client: c, token: (a) => x.token(a, blockNumber), blockNumber },
    owner,
    vault,
    cfg.assets,
    opts.allowance ?? 'exact',
  );
  drafts.push(...ap.drafts);
  return finalize(x, owner, vault, drafts, `${createSummary} ${drafts.length} transaction(s) to sign.`, [
    ...r.warnings,
    ...ap.warnings,
  ]);
}
