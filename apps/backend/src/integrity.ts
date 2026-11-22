import { isoAt } from './clock';
import type { Deps } from './deps';
import { opsAlert } from './ops';
import { saveIntegrity } from './store/integrity';

/** Spec §9.2: the SDK's integrity() every ten minutes; a failure is stored and mailed to ops once. */
export async function runIntegrity(d: Deps): Promise<{ ok: boolean; block: bigint; failed: string[] }> {
  const report = await d.chain.integrity();
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
