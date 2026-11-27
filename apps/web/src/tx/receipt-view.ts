import type { ActionName, SentStep, StateName, TxPlan, VaultEvent } from '@atropyle/sdk';
import type { Hex } from 'viem';
import type { StepRow } from './tx-view';

/** One confirmed step as its Receipt shows it; `blockNumber` and `time` are null until read. */
export interface ReceiptStep {
  index: number;
  action: ActionName;
  hash: Hex;
  blockNumber: bigint | null;
  time: bigint | null;
  events: readonly VaultEvent[];
}

/** One transaction: a step of its own, or every step of a bundle that one transaction carried. */
export interface ReceiptGroup {
  hash: Hex;
  blockNumber: bigint | null;
  time: bigint | null;
  steps: readonly ReceiptStep[];
  events: readonly VaultEvent[];
}

/** The SDK's STATE_CODES, held here so a page need not load the SDK to name a state; test/unit/receipt pins them. */
export const STATE_BY_CODE: Readonly<Partial<Record<number, StateName>>> = {
  0: 'active',
  1: 'grace',
  3: 'recovery',
  5: 'releasedInherit',
  7: 'releasedRecover',
};

/**
 * Every confirmed row of the plan, with what the last send's result knows about it (block, events). Rows confirmed
 * by an earlier, partly failed send carry only their hash until readReceipt fills them (parked T13 161).
 */
export function receiptBase(
  plan: TxPlan,
  rows: readonly Pick<StepRow, 'index' | 'phase' | 'hash'>[],
  known: readonly SentStep[],
): ReceiptStep[] {
  const byIndex = new Map(known.map((s) => [s.index, s]));
  return rows.flatMap((r): ReceiptStep[] => {
    const k = byIndex.get(r.index);
    const hash = k?.hash ?? r.hash;
    const action = plan.steps[r.index]?.action;
    if (r.phase !== 'confirmed' || !hash || !action) return [];
    return [{ index: r.index, action, hash, blockNumber: k?.blockNumber ?? null, time: null, events: k?.events ?? [] }];
  });
}

export function receiptGroups(steps: readonly ReceiptStep[]): ReceiptGroup[] {
  const out: ReceiptGroup[] = [];
  for (const s of steps) {
    const last = out.at(-1);
    if (last && last.hash.toLowerCase() === s.hash.toLowerCase()) {
      out[out.length - 1] = {
        ...last,
        blockNumber: last.blockNumber ?? s.blockNumber,
        time: last.time ?? s.time,
        steps: [...last.steps, s],
        events: [...last.events, ...s.events],
      };
    } else {
      out.push({ hash: s.hash, blockNumber: s.blockNumber, time: s.time, steps: [s], events: [...s.events] });
    }
  }
  return out;
}

function stateOf(v: unknown): StateName | null {
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number.NaN;
  return STATE_BY_CODE[n] ?? null;
}

export interface StateChange {
  from: StateName;
  to: StateName;
}

/** What the circuit decided in these events: each StateChanged(from, to) whose codes name a state. */
export function stateChanges(events: readonly VaultEvent[]): StateChange[] {
  return events.flatMap((e): StateChange[] => {
    if (e.name !== 'StateChanged') return [];
    const from = stateOf(e.args.from);
    const to = stateOf(e.args.to);
    return from && to ? [{ from, to }] : [];
  });
}

/** A transaction hash in groups of four after `0x`, like an address in the Ledger voice. */
export function hashGroups(hash: string): string[] {
  return hash.replace(/^0x/i, '').match(/.{1,4}/g) ?? [];
}
