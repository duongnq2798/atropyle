import type { IntegrityReport } from '@atropyle/sdk';
import { isoAt } from './clock';
import type { Deps } from './deps';
import { errorText } from './log';
import { opsAlert } from './ops';
import { saveIntegrity } from './store/integrity';

/** A run that threw: only an error code is stored, never message text that came from the chain. */
function crashed(d: Deps, e: unknown): IntegrityReport {
  const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'INTEGRITY_ERROR';
  d.log.error('integrity run failed', { error: errorText(e) });
  return {
    ok: false,
    chainId: 0,
    blockNumber: 0n,
    blockTimestamp: 0n,
    rpcs: 0,
    checks: [{ name: 'integrity run', ok: false, actual: code }],
    warnings: [],
  };
}

/** Spec §9.2: the SDK's integrity() every ten minutes; a failure, or a run that cannot finish, is stored and mailed once. */
export async function runIntegrity(d: Deps): Promise<{ ok: boolean; block: bigint; failed: string[] }> {
  let report: IntegrityReport;
  try {
    report = await d.chain.integrity();
  } catch (e) {
    report = crashed(d, e);
  }
  await saveIntegrity(d.sql, report, isoAt(d.clock.now()));
  const failed = report.checks.filter((c) => !c.ok).map((c) => c.name);
  await opsAlert(
    d,
    'integrity',
    !report.ok,
    report.ok
      ? 'Every integrity check passes again.'
      : `Integrity failed at block ${report.blockNumber}: ${failed.join(', ')}.`,
  );
  return { ok: report.ok, block: report.blockNumber, failed };
}
