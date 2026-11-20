import type { PolicyVerification, Warning } from '@atropyle/sdk';
import type { IntegrityCheck, PropertyName, VaultVerification } from '@atropyle/sdk/verify';

export type RowState = 'pass' | 'fail' | 'unknown';
export type RowId = 'factory' | 'proxy' | 'binding' | 'code' | 'policy' | 'operators';

export interface VerifyRow {
  id: RowId;
  state: RowState;
  detail: string | null;
}

function rowOf(id: RowId, checks: readonly IntegrityCheck[], names: readonly string[]): VerifyRow {
  const found = names.map((n) => checks.find((c) => c.name === n));
  if (found.some((c) => !c)) return { id, state: 'unknown', detail: null };
  const bad = found.find((c) => c && !c.ok);
  if (!bad) return { id, state: 'pass', detail: null };
  return {
    id,
    state: 'fail',
    detail: bad.expected !== undefined ? `${bad.expected} → ${bad.actual ?? '?'}` : bad.name,
  };
}

export function vaultVerifyRows(v: VaultVerification): VerifyRow[] {
  const p = v.policy;
  const policy: VerifyRow =
    p.status === 'verified'
      ? { id: 'policy', state: p.result.ok && p.unchanged ? 'pass' : 'fail', detail: p.unchanged ? null : 'changed' }
      : { id: 'policy', state: 'unknown', detail: p.status === 'unavailable' ? p.error.code : null };
  return [
    rowOf('factory', v.checks, ['factory.isVault']),
    rowOf('proxy', v.checks, ['vault.proxy']),
    rowOf('binding', v.checks, ['vault.factory', 'vault.cpu', 'vault.policyId']),
    rowOf('code', v.checks, ['vaultImpl.codehash']),
    policy,
    { id: 'operators', state: v.rpcs >= 2 ? 'pass' : 'unknown', detail: v.rpcs >= 2 ? null : 'SINGLE_RPC' },
  ];
}

export const PROPERTY_ORDER: readonly PropertyName[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];

export interface ProofSummary {
  ok: boolean;
  properties: { name: PropertyName; ok: boolean; violations: number }[];
  combos: number;
  seconds: number;
  rpcs: number;
  blockNumber: bigint;
  warnings: Warning[];
  issues: string[];
}

export function proofSummary(r: PolicyVerification): ProofSummary {
  return {
    ok: r.ok,
    properties: PROPERTY_ORDER.map((name) => ({ name, ...r.properties[name] })),
    combos: r.combos,
    seconds: Math.round(r.ms / 100) / 10,
    rpcs: r.rpcs,
    blockNumber: r.blockNumber,
    warnings: r.warnings,
    issues: r.issues,
  };
}
