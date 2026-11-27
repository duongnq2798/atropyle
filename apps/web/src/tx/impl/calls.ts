import {
  type AtropyleClient,
  AtropyleError,
  type AtropyleErrorJson,
  factoryAbi,
  type SendOptions,
  type SendResult,
  type SentStep,
  sameAddress,
  type TxPlan,
  type VaultEvent,
  vaultAbi,
} from '@atropyle/sdk';
import { getAddress, type Hex, parseEventLogs, type TransactionReceipt, type WalletClient } from 'viem';
import {
  type CallsResult,
  type CallsStatus,
  CallsUnsupported,
  sendCalls,
  supportsSendCalls,
} from '@/wallet/impl/send-calls';
import type { Eip1193 } from '@/wallet/impl/wallet';
import type { ReceiptStep } from '../receipt-view';
import { pageGone } from './decode';

export interface SendDeps {
  atro: AtropyleClient;
  provider: Eip1193;
  walletClient: WalletClient;
}

export interface SendHooks {
  onStep?: SendOptions['onStep'];
  /** Right before wallet_sendCalls: the wallet shows every remaining step at once. */
  onBatch?(): void;
  /** The wallet refused wallet_sendCalls as unsupported: the plan goes one step at a time instead. */
  onFallback?(): void;
  /** Every wallet_getCallsStatus poll of the bundle. */
  onStatus?(s: CallsStatus): void;
  /** false: never bundle (a bundle of this plan already failed part-way). */
  batch?: boolean;
  /**
   * False once the page that started the plan is gone: no wallet_sendCalls opens after that, and the bundle's status
   * is no longer polled (the wallet keeps the bundle). The step-by-step path has the same guard in the wallet client
   * the runner passes (rule 5 of 7A).
   */
  live?(): boolean;
}

export type BatchOutcome = { kind: 'sendCalls'; result: CallsResult } | { kind: 'sequential'; result: SendResult };

export type TxSender = (d: SendDeps, plan: TxPlan, o: SendHooks) => Promise<BatchOutcome>;

/**
 * Bundles with EIP-5792 when the wallet says it can for this chain, else signs step by step (as the previous web app
 * did). A wallet that claims support and then refuses the method falls back too.
 */
export const sendBatchOrSequential: TxSender = async (d, plan, o) => {
  const live = o.live ?? (() => true);
  if (o.batch !== false && (await supportsSendCalls(d.provider, plan.from, plan.chainId))) {
    // The capability check was a round trip to the wallet: the page may have gone meanwhile.
    if (!live()) throw pageGone();
    o.onBatch?.();
    try {
      const result = await sendCalls(d.provider, d.atro.handoff.calls(plan), {
        onStatus: o.onStatus,
        sleep: (ms) =>
          new Promise<void>((resolve, reject) => {
            setTimeout(() => (live() ? resolve() : reject(pageGone())), ms);
          }),
      });
      return { kind: 'sendCalls', result };
    } catch (e) {
      if (!(e instanceof CallsUnsupported)) throw e;
      o.onFallback?.();
    }
  }
  return { kind: 'sequential', result: await d.atro.send(plan, d.walletClient, { onStep: o.onStep }) };
};

const ABI = [...vaultAbi, ...factoryAbi];

/** The events of the vault and the factory in these receipts, decoded as the SDK's sendPlan does. */
export function decodeEvents(
  atro: AtropyleClient,
  plan: TxPlan,
  receipts: readonly TransactionReceipt[],
): VaultEvent[] {
  const logs = receipts
    .flatMap((r) => r.logs)
    .filter((l) => sameAddress(l.address, plan.vault) || sameAddress(l.address, atro.deployment.factory));
  return parseEventLogs({ abi: ABI, logs, strict: true }).map((l) => ({
    address: getAddress(l.address),
    name: l.eventName,
    args: l.args as Record<string, unknown>,
    blockNumber: l.blockNumber,
    logIndex: l.logIndex,
    transactionHash: l.transactionHash,
  }));
}

/** One receipt per call, or one for the whole bundle (a smart account): then the last step carries its events. */
function sentSteps(atro: AtropyleClient, plan: TxPlan, receipts: readonly TransactionReceipt[]): SentStep[] {
  const own = receipts.length === plan.steps.length;
  const last = receipts[receipts.length - 1];
  return plan.steps.map((s, index) => {
    const r = own ? receipts[index] : last;
    const carries = own || index === plan.steps.length - 1;
    return {
      index,
      action: s.action,
      hash: r.transactionHash,
      blockNumber: r.blockNumber,
      gasUsed: carries ? r.gasUsed : 0n,
      events: carries ? decodeEvents(atro, plan, [r]) : [],
    };
  });
}

export type Settled =
  | { kind: 'confirmed'; result: SendResult }
  | { kind: 'stuck'; calls: CallsResult }
  | {
      kind: 'failed';
      calls: CallsResult;
      confirmed: number;
      hashes: Hex[];
      failedHash: Hex | null;
      error: AtropyleErrorJson;
    };

/** How long a receipt the wallet reported may take to reach the app's own RPC. */
export const RECEIPT_TIMEOUT_MS = 30_000;

async function receiptOf(atro: AtropyleClient, hash: Hex, timeout: number): Promise<TransactionReceipt | null> {
  try {
    return await atro.publicClient.waitForTransactionReceipt({ hash, timeout });
  } catch {
    return null;
  }
}

/** A step's own receipt: sent by the plan's signer to that step's contract. */
function ownReceipt(plan: TxPlan, r: TransactionReceipt, index: number): boolean {
  const s = plan.steps[index];
  return s !== undefined && sameAddress(r.from, plan.from) && r.to !== null && sameAddress(r.to, s.to);
}

function failedAt(plan: TxPlan, calls: CallsResult, at: number, hashes: Hex[], failedHash: Hex | null): Settled {
  const error = new AtropyleError('UNKNOWN', {
    message: `Step ${at + 1} (${plan.steps[at]?.action ?? 'unknown'}) did not go through in the wallet's bundle.`,
    details: { index: at, completed: at, ...(failedHash ? { hash: failedHash } : {}) },
  }).toJSON();
  return { kind: 'failed', calls, confirmed: at, hashes, failedHash, error };
}

/**
 * What a bundle the wallet reported on did, read from the app's own RPC, never from the wallet's word alone: a step
 * is "Confirmed" only after its receipt (R18.16). `stuck`: this page cannot tell what happened, so nothing may be
 * sent again. `failed`: the calls before `confirmed` went through, the one at `confirmed` did not, and nothing after
 * it did; the next send starts there, one step at a time.
 */
export async function settleBatch(
  atro: AtropyleClient,
  plan: TxPlan,
  calls: CallsResult,
  o: { timeoutMs?: number } = {},
): Promise<Settled> {
  const stuck: Settled = { kind: 'stuck', calls };
  if (calls.status !== 'confirmed' && calls.status !== 'failed' && calls.status !== 'reverted') return stuck;
  const n = plan.steps.length;
  if (calls.hashes.length > n) return stuck;
  // 400: the wallet put nothing on chain. Any other status without a hash says nothing this page can check.
  if (calls.hashes.length === 0) return calls.status === 'failed' ? failedAt(plan, calls, 0, [], null) : stuck;
  const read = await Promise.all(calls.hashes.map((h) => receiptOf(atro, h, o.timeoutMs ?? RECEIPT_TIMEOUT_MS)));
  const rs = read.filter((r): r is TransactionReceipt => r !== null);
  if (rs.length !== read.length) return stuck;
  const confirmed = (): Settled => ({
    kind: 'confirmed',
    result: { vault: plan.vault, steps: sentSteps(atro, plan, rs) },
  });
  if (!rs.every((r, i) => ownReceipt(plan, r, i))) {
    // One transaction for the whole bundle (a smart account): it went through or it did not, all at once.
    if (rs.length !== 1) return stuck;
    if (rs[0].status !== 'success') return failedAt(plan, calls, 0, [], rs[0].transactionHash);
    return calls.status === 'confirmed' ? confirmed() : stuck;
  }
  const k = rs.findIndex((r) => r.status !== 'success');
  if (k === -1) {
    if (rs.length === n) return confirmed();
    // Every call the wallet sent went through, but fewer than the plan has: final only when the wallet says it failed.
    return calls.status === 'confirmed'
      ? stuck
      : failedAt(
          plan,
          calls,
          rs.length,
          rs.map((r) => r.transactionHash),
          null,
        );
  }
  // A call after the one that failed went through: the plan's order no longer holds, and no step may be sent again.
  if (rs.slice(k + 1).some((r) => r.status === 'success')) return stuck;
  return failedAt(
    plan,
    calls,
    k,
    rs.slice(0, k).map((r) => r.transactionHash),
    rs[k].transactionHash,
  );
}

export type StepCheck =
  | { kind: 'confirmed'; step: SentStep }
  | { kind: 'reverted'; error: AtropyleErrorJson }
  | { kind: 'unknown' };

/**
 * The receipt of a step the wallet sent in `hash` but whose receipt the send could not read (parked T13 160/167).
 * `unknown` while the RPC has none, or when the receipt is not the plan signer's call to that step's contract.
 */
export async function checkStep(atro: AtropyleClient, plan: TxPlan, index: number, hash: Hex): Promise<StepCheck> {
  let r: TransactionReceipt;
  try {
    r = await atro.publicClient.getTransactionReceipt({ hash });
  } catch {
    return { kind: 'unknown' };
  }
  const s = plan.steps[index];
  if (!s || !ownReceipt(plan, r, index)) return { kind: 'unknown' };
  if (r.status !== 'success') {
    const error = new AtropyleError('UNKNOWN', {
      message: `Step ${index + 1} (${s.action}) reverted on chain in transaction ${hash}.`,
      details: { index, completed: index, hash },
    }).toJSON();
    return { kind: 'reverted', error };
  }
  return {
    kind: 'confirmed',
    step: {
      index,
      action: s.action,
      hash,
      blockNumber: r.blockNumber,
      gasUsed: r.gasUsed,
      events: decodeEvents(atro, plan, [r]),
    },
  };
}

/**
 * Fills a Receipt in the background: the block and events of steps an earlier send of a resumed plan confirmed
 * (their receipt is read again), then every block's time. A read that fails leaves the field empty; it never throws.
 */
export async function readReceipt(
  atro: AtropyleClient,
  plan: TxPlan,
  steps: readonly ReceiptStep[],
): Promise<ReceiptStep[]> {
  const filled = await Promise.all(
    steps.map(async (s): Promise<ReceiptStep> => {
      if (s.blockNumber !== null) return s;
      try {
        const r = await atro.publicClient.getTransactionReceipt({ hash: s.hash });
        return { ...s, blockNumber: r.blockNumber, events: decodeEvents(atro, plan, [r]) };
      } catch {
        return s;
      }
    }),
  );
  const times = new Map<bigint, bigint>();
  const blocks = [...new Set(filled.flatMap((s) => (s.blockNumber === null ? [] : [s.blockNumber])))];
  await Promise.all(
    blocks.map(async (blockNumber) => {
      try {
        times.set(blockNumber, (await atro.publicClient.getBlock({ blockNumber })).timestamp);
      } catch {
        // The receipt shows the block alone.
      }
    }),
  );
  return filled.map((s) => ({ ...s, time: s.blockNumber === null ? null : (times.get(s.blockNumber) ?? null) }));
}
