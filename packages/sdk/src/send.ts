import type { Address, Hex, TransactionReceipt, WalletClient } from 'viem';
import { factoryAbi, vaultAbi } from './abi/index';
import { sameAddress } from './address';
import { AtropyleError, type AtropyleErrorJson, decodeError, type ErrorCode } from './errors';
import { simulateTxs } from './prepare/simulate';
import type { ActionName, PreparedTx, Simulation, TxPlan } from './prepare/types';
import type { ReadContext } from './read/context';
import { decodeLogs, type VaultEvent } from './read/events';

export interface SentStep {
  index: number;
  action: ActionName;
  hash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  /** Decoded events of the vault and the factory in this transaction. */
  events: VaultEvent[];
}

export interface SendResult {
  vault: Address;
  steps: SentStep[];
}

export type SendPhase = 'signing' | 'pending' | 'confirmed';

export interface SendOptions {
  onStep?: (e: { index: number; total: number; step: PreparedTx; phase: SendPhase; hash?: Hex }) => void;
  /**
   * Gas limit = simulated gas × gasBuffer for simulated steps (default 1.3, from 1 to 10); other steps let the wallet
   * estimate. `Simulation.gas` is an estimateGas result for a single step and an eth_simulateV1 gasUsed for a
   * multi-step plan, so a vault call that sweeps assets needs the headroom: it checks its gas before every transfer.
   */
  gasBuffer?: number;
}

const ABI = [...vaultAbi, ...factoryAbi];

function bufferPercent(buffer: number | undefined): bigint {
  const b = buffer ?? 1.3;
  if (!Number.isFinite(b) || b < 1 || b > 10) {
    throw new AtropyleError('INVALID_OPTIONS', { message: 'gasBuffer must be a number from 1 to 10.' });
  }
  return BigInt(Math.round(b * 100));
}

/** Every failure of a step carries which step it was and how many were done, so nobody sends the finished ones again. */
function failure(
  code: ErrorCode,
  message: string,
  at: { index: number; completed: number },
  extra: { cause?: unknown; details?: Record<string, unknown> } = {},
): AtropyleError {
  return new AtropyleError(code, { message, cause: extra.cause, details: { ...extra.details, ...at } });
}

/**
 * Sends each step in order and waits for its receipt (spec §5.2). For callers that already hold a WalletClient
 * (web app, keeper); agents hand off instead. A step whose simulation failed is never sent. Nothing is retried here: a
 * wallet request that failed may still be pending in the wallet, and sending it twice would move assets twice.
 */
export async function sendPlan(
  ctx: ReadContext,
  plan: TxPlan,
  wallet: WalletClient,
  o: SendOptions = {},
): Promise<SendResult> {
  const buffer = bufferPercent(o.gasBuffer);
  const accounts = wallet.account ? [wallet.account.address] : await wallet.getAddresses();
  const signer = accounts.find((a) => sameAddress(a, plan.from));
  if (!signer) {
    throw new AtropyleError('WRONG_ACCOUNT', {
      message: `This plan must be signed by ${plan.from}; the wallet uses ${accounts[0] ?? 'no account'}.`,
      details: { expected: plan.from, actual: accounts[0] ?? null },
    });
  }
  const chainId = await wallet.getChainId();
  if (chainId !== plan.chainId) {
    throw new AtropyleError('WRONG_CHAIN', {
      message: `This plan is for chain ${plan.chainId}; the wallet is on chain ${chainId}.`,
      details: { expected: plan.chainId, actual: chainId },
    });
  }
  const total = plan.steps.length;
  const steps: SentStep[] = [];
  for (const [index, step] of plan.steps.entries()) {
    const at = { index, completed: steps.length };
    const wouldRevert = (error: AtropyleErrorJson) =>
      failure(error.code, `Step ${index + 1} (${step.action}) would revert: ${error.message}`, at, {
        details: error.details,
      });
    let sim: Simulation = step.simulation;
    if (sim.ok === false) throw wouldRevert(sim.error);
    if (step.action === 'createVault' || sim.ok === 'skipped') {
      // Simulated against the state the earlier steps left, which is on chain by now. createVault: the fee switches
      // from early to full at the 100th paid vault, createVault takes no maxFee, and a vault may already sit at the
      // address. A skipped step: it only failed alone because it needed an earlier step.
      try {
        [sim] = await simulateTxs(ctx.client, signer, [step]);
      } catch (e) {
        const err = decodeError(e);
        throw failure(err.code, err.message, at, { cause: e, details: err.details });
      }
      if (sim.ok === false) throw wouldRevert(sim.error);
    }
    o.onStep?.({ index, total, step, phase: 'signing' });
    let hash: Hex;
    try {
      hash = await wallet.sendTransaction({
        account: wallet.account ?? signer,
        chain: null,
        to: step.to,
        data: step.data,
        value: step.value,
        ...(sim.ok === true ? { gas: (sim.gas * buffer) / 100n } : {}),
      });
    } catch (e) {
      const err = decodeError(e);
      throw failure(err.code, err.message, at, { cause: e, details: err.details });
    }
    o.onStep?.({ index, total, step, phase: 'pending', hash });
    let receipt: TransactionReceipt;
    try {
      receipt = await ctx.client.waitForTransactionReceipt({ hash });
    } catch (e) {
      const err = decodeError(e);
      throw failure(
        err.code,
        `Step ${index + 1} (${step.action}) was sent in transaction ${hash}, but its receipt could not be read: ${err.message}`,
        at,
        { cause: e, details: { ...err.details, hash } },
      );
    }
    if (receipt.status !== 'success') {
      throw failure('UNKNOWN', `Step ${index + 1} (${step.action}) reverted on chain in transaction ${hash}.`, at, {
        details: { hash },
      });
    }
    const ours = receipt.logs.filter(
      (l) => sameAddress(l.address, plan.vault) || sameAddress(l.address, ctx.deployment.factory),
    );
    steps.push({
      index,
      action: step.action,
      hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      events: decodeLogs(ABI, ours),
    });
    ctx.log({ type: 'send', what: `${step.action} ${hash}`, blockNumber: receipt.blockNumber });
    o.onStep?.({ index, total, step, phase: 'confirmed', hash });
  }
  return { vault: plan.vault, steps };
}
