import {
  type AtropyleClient,
  AtropyleError,
  type AtropyleErrorJson,
  decodeError,
  type IntegrityReport,
  type PolicyVerification,
  type VaultVerification,
  type Warning,
} from '@atropyle/sdk';
import { plural } from './explain';
import type { VerifyInput } from './inputs';
import {
  type IntegrityOutput,
  IntegrityOutputSchema,
  type PolicyStatus,
  type VerifyOutput,
  VerifyOutputSchema,
} from './schemas';
import { finish } from './untrusted';

export type ProgressFn = (done: number, total: number) => void;
export interface VerifyHooks {
  onProgress?: ProgressFn;
  /** The URL groups actually used, one per operator. Defaults to deployment.quorumRpcUrls. */
  operators?: string[][];
}
export const VERIFY_COMMAND = 'npx -y atropyle verify' as const;

/** Calls `cb` at most once per 1/steps of the work, and always for the last call. */
export function throttleProgress(cb: ProgressFn, steps = 100): ProgressFn {
  let last = -1;
  return (done, total) => {
    const bucket = total > 0 ? Math.min(steps, Math.floor((done * steps) / total)) : steps;
    if (bucket <= last) return;
    last = bucket;
    cb(done, total);
  };
}

/** Host names only: an RPC URL can carry an API key in its path or query string. */
export function operatorHosts(groups: readonly (readonly string[])[]): string[][] {
  return groups.map((g) =>
    g.map((u) => {
      try {
        return new URL(u).host;
      } catch {
        return 'invalid-url';
      }
    }),
  );
}

/** Drops repeated warnings (same code and message), keeping the first. */
function uniqueWarnings(ws: readonly Warning[]): Warning[] {
  const seen = new Set<string>();
  return ws.filter((w) => {
    const key = `${w.code}\n${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summaryOf(status: PolicyStatus, chainId: number, p: PolicyVerification | null, v: VaultVerification | null) {
  const parts: string[] = [];
  if (status === 'verified' && p) {
    // A property that never ran (an RPC or netlist failure) is { ok: false, violations: 0 }: it is not a violation.
    const failed = Object.entries(p.properties)
      .filter(([, r]) => r.violations > 0)
      .map(([k]) => k);
    // P9 fails on its own only when the processor gave answers that differ from the simulator.
    if (p.p9 && p.p9.mismatches.length > 0) failed.push('P9');
    const p9 = p.p9
      ? `, step() on the processor matches the simulator on ${p.p9.vectors} seeded vectors (P9, seed ${p.p9.seed}) at each operator`
      : '';
    parts.push(
      p.ok
        ? `Policy verified: P1-P8 hold on all ${p.combos.toLocaleString('en-US')} combinations (${(p.ms / 1000).toFixed(1)} s)${p9}, and ${plural(p.rpcs, 'RPC operator')} agree at block ${p.blockNumber}.`
        : `Policy verification FAILED: ${failed.length > 0 ? `${failed.join(', ')} ${failed.length === 1 ? 'does' : 'do'} not hold` : `${plural(p.issues.length, 'issue')} found`}.`,
    );
  } else if (status === 'unavailable') {
    parts.push(`The policy netlist cannot be read on chain ${chainId} (POLICY_UNAVAILABLE), so nothing was proven.`);
  } else if (status === 'mismatch') {
    parts.push(
      'The on-chain policy does not match the published source (POLICY_MISMATCH). Do not trust this deployment.',
    );
  } else {
    parts.push('Policy proof skipped.');
  }
  if (v) {
    const bad = v.checks.filter((c) => !c.ok).map((c) => c.name);
    parts.push(
      v.ok
        ? `Vault ${v.vault} passes ${plural(v.checks.length, 'check')} and is ${v.snapshot.status.state}.`
        : `Vault ${v.vault} FAILS${bad.length > 0 ? `: ${bad.join(', ')}` : ''}.`,
    );
  }
  return parts.join(' ');
}

/**
 * Spec §5.4. The SDK caches verifyPolicy per client: a second call fires no `onProgress`.
 * A proof that cannot run is a failed verification (ok: false); a network error is thrown. */
export async function verify(atro: AtropyleClient, input: VerifyInput, hooks: VerifyHooks = {}): Promise<VerifyOutput> {
  const wantPolicy = input.policy !== false;
  if (!wantPolicy && input.vault === undefined) {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: 'Nothing to verify: give a vault, or keep the policy proof.',
    });
  }
  if (!wantPolicy && input.p9Seed !== undefined) {
    throw new AtropyleError('INVALID_OPTIONS', { message: 'A P9 seed needs the policy proof, which P9 is part of.' });
  }
  let policy: PolicyVerification | null = null;
  let policyError: AtropyleErrorJson | null = null;
  let policyStatus: PolicyStatus = 'skipped';
  if (wantPolicy) {
    try {
      policy = await atro.verifyPolicy({
        ...(hooks.onProgress ? { onProgress: hooks.onProgress } : {}),
        ...(input.p9Seed === undefined ? {} : { p9Seed: BigInt(input.p9Seed) }),
      });
      policyStatus = 'verified';
    } catch (e) {
      const err = decodeError(e);
      // The SDK as built reports a mismatch through `issues`; the POLICY_MISMATCH branch is kept for a future SDK that throws.
      if (err.code !== 'POLICY_UNAVAILABLE' && err.code !== 'POLICY_MISMATCH') throw err;
      policyStatus = err.code === 'POLICY_UNAVAILABLE' ? 'unavailable' : 'mismatch';
      policyError = err.toJSON();
    }
  }
  // verifyPolicy() is cached per client, so the vault check reuses the proof above instead of running it again.
  const v =
    input.vault === undefined ? null : await atro.vault(input.vault).verify({ policy: policyStatus === 'verified' });
  const policyOk = policyStatus === 'verified' ? (policy?.ok ?? false) : policyStatus === 'skipped';
  const groups = hooks.operators ?? atro.deployment.quorumRpcUrls;
  return finish(VerifyOutputSchema, {
    ok: policyOk && (v === null || v.ok),
    target: v ? 'vault' : 'policy',
    chainId: atro.deployment.chainId,
    blockNumber: policy?.blockNumber ?? v?.blockNumber ?? null,
    rpcs: policy?.rpcs ?? v?.rpcs ?? groups.length,
    operators: operatorHosts(groups),
    policyStatus,
    policy,
    policyError,
    vault: v && {
      address: v.vault,
      ok: v.ok,
      checks: v.checks,
      unchanged: v.policy.status === 'verified' ? v.policy.unchanged : null,
      state: v.snapshot.status.state,
      status: v.snapshot.status,
      config: v.snapshot.config,
      timeline: v.timeline,
    },
    summary: summaryOf(policyStatus, atro.deployment.chainId, policy, v),
    warnings: uniqueWarnings([...(policy?.warnings ?? []), ...(v?.warnings ?? [])]),
  });
}

/** Remote mode (spec §9.2): the latest report from the Worker's cron, plus the command to check it yourself. */
export function integrityOutput(latest: { report: IntegrityReport; checkedAt: string } | null): IntegrityOutput {
  const summary =
    latest === null
      ? `No integrity report yet. Run ${VERIFY_COMMAND} to check the deployment from your own machine.`
      : `${latest.report.ok ? 'The deployment passed' : 'The deployment FAILED'} its integrity checks at ${latest.checkedAt} (block ${latest.report.blockNumber}). This report comes from the hosted server; run ${VERIFY_COMMAND} to check it yourself.`;
  return finish(IntegrityOutputSchema, {
    checkedAt: latest?.checkedAt ?? null,
    report: latest?.report ?? null,
    verifyCommand: VERIFY_COMMAND,
    summary,
    warnings: latest?.report.warnings ?? [],
  });
}
