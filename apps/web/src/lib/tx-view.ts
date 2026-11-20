import type { ActionName, AtropyleErrorJson, SendPhase, Simulation, TxPlan, Warning } from '@atropyle/sdk';
import type { Address, Hex } from 'viem';

export type StepPhase = 'ready' | 'skipped' | 'blocked' | 'signing' | 'pending' | 'confirmed' | 'failed';

export interface StepRow {
  index: number;
  action: ActionName;
  to: Address;
  /** Built by the SDK from addresses and numbers only; never contains token names. */
  summary: string;
  simulation: 'ok' | 'failed' | 'skipped';
  gas: bigint | null;
  phase: StepPhase;
  hash: Hex | null;
  error: AtropyleErrorJson | null;
}

export interface TxView {
  total: number;
  rows: StepRow[];
  warnings: Warning[];
  canSend: boolean;
  blockedAt: number | null;
  blockedError: AtropyleErrorJson | null;
}

export function simState(s: Simulation): StepRow['simulation'] {
  if (s.ok === true) return 'ok';
  return s.ok === false ? 'failed' : 'skipped';
}

/** The SDK names the token or asset in `message`, so the code alone would hide a second, different warning. */
export function warningKey(w: Warning): string {
  return `${w.code}:${w.message}`;
}

export function uniqueWarnings(lists: readonly (readonly Warning[])[]): Warning[] {
  const seen = new Map<string, Warning>();
  for (const list of lists) for (const w of list) if (!seen.has(warningKey(w))) seen.set(warningKey(w), w);
  return [...seen.values()];
}

export function txView(plan: TxPlan): TxView {
  const rows: StepRow[] = plan.steps.map((s, index) => {
    const sim = simState(s.simulation);
    return {
      index,
      action: s.action,
      to: s.to,
      summary: s.summary,
      simulation: sim,
      gas: s.simulation.ok === true ? s.simulation.gas : null,
      phase: sim === 'ok' ? 'ready' : sim === 'failed' ? 'blocked' : 'skipped',
      hash: null,
      error: s.simulation.ok === false ? s.simulation.error : null,
    };
  });
  const blocked = rows.find((r) => r.phase === 'blocked') ?? null;
  return {
    total: rows.length,
    rows,
    warnings: uniqueWarnings([plan.warnings, ...plan.steps.map((s) => s.warnings)]),
    canSend: blocked === null && rows.length > 0,
    blockedAt: blocked ? blocked.index : null,
    blockedError: blocked ? blocked.error : null,
  };
}

export function applyStep(v: TxView, e: { index: number; phase: SendPhase; hash?: Hex }): TxView {
  return {
    ...v,
    rows: v.rows.map((r) => (r.index === e.index ? { ...r, phase: e.phase, hash: e.hash ?? r.hash } : r)),
  };
}

export function failStep(v: TxView, index: number, error: AtropyleErrorJson): TxView {
  return { ...v, rows: v.rows.map((r) => (r.index === index ? { ...r, phase: 'failed', error } : r)) };
}
