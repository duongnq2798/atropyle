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

/**
 * The numbers of a RECOVERY_POWER warning, so a page can say it in the viewer's language (web-legacy's WarningText):
 * k guardians of n can move everything once the alarm window (seconds) ends. Read from `params`, the typed numbers
 * the SDK built `message` from, never from `message`. null for any other warning, or when a number is missing or not
 * a safe integer: the page then shows the SDK's English `message`.
 */
export function recoveryPowerParams(w: Warning): { k: number; n: number; window: number } | null {
  const p = w.params;
  if (w.code !== 'RECOVERY_POWER' || !p) return null;
  const { k, guardians: n, window: seconds } = p;
  if (!isInt(k) || !isInt(n) || !isInt(seconds)) return null;
  return { k, n, window: seconds };
}

const isInt = (x: number | undefined): x is number => Number.isSafeInteger(x);

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

/** The phase a row has before any send: what its simulation allows. */
function initialPhase(r: StepRow): StepPhase {
  return r.simulation === 'ok' ? 'ready' : r.simulation === 'failed' ? 'blocked' : 'skipped';
}

/** Every row from `from` on that is not confirmed takes `phase`: a bundle the wallet shows, then holds. */
export function markRows(v: TxView, from: number, phase: 'signing' | 'pending'): TxView {
  return { ...v, rows: v.rows.map((r) => (r.index >= from && r.phase !== 'confirmed' ? { ...r, phase } : r)) };
}

/** Rows from `from` on that the wallet showed but never took (no hash) go back to their phase before the send. */
export function rewind(v: TxView, from: number): TxView {
  return {
    ...v,
    rows: v.rows.map((r) =>
      r.index >= from && r.hash === null && (r.phase === 'signing' || r.phase === 'pending')
        ? { ...r, phase: initialPhase(r) }
        : r,
    ),
  };
}

/** `hash`: the transaction the step reverted in; the row keeps it, so the card links it. */
export function failStep(v: TxView, index: number, error: AtropyleErrorJson, hash: Hex | null = null): TxView {
  return {
    ...v,
    rows: v.rows.map((r) => (r.index === index ? { ...r, phase: 'failed', error, hash: hash ?? r.hash } : r)),
  };
}
