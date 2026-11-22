import { RETRY_AFTER } from '@atropyle/sdk';
import { type Hex, isHex } from 'viem';
import { isoAt } from '../clock';
import type { Deps } from '../deps';
import { opsAlert } from '../ops';
import { dueVaults, type KeeperLogRow, lastDistributes, logKeeper, setNextCheck } from '../store/keeper';
import { setMeta } from '../store/meta';

/** Wall time one keeper transaction may take (simulate, send, receipt). The budget allows floor(left / this). */
export const KEEPER_TX_MS = 2_500;

export interface KeeperPhaseResult {
  ran: boolean;
  dryRun: boolean;
  due: number;
  sent: number;
  stopped: 'LOW_BALANCE' | null;
}

/** A broadcast that then failed (revert, unreadable receipt) reports its hash only in error.details.hash. */
function failedHash(details: unknown): Hex | null {
  const h = (details as { hash?: unknown } | undefined)?.hash;
  return typeof h === 'string' && isHex(h) && h.length === 66 ? h : null;
}

/**
 * Spec §9.3.3 with the limits of the ecosystem spec §9.4: at most keeperMaxTx (20) attempts, the SDK's gas cap,
 * a stop below 0.005 OKB. Runs even with no vault due, so the balance alert and /health stay current.
 */
export async function runKeeperPhase(d: Deps, now: bigint, deadlineMs: number): Promise<KeeperPhaseResult> {
  const maxTx = Math.min(d.config.keeperMaxTx, Math.floor((deadlineMs - d.clock.now()) / KEEPER_TX_MS));
  const due = await dueVaults(d.sql, now);
  if (maxTx < 1) return { ran: false, dryRun: true, due: due.length, sent: 0, stopped: null };
  const report = await d.chain.keeper({ vaults: due, maxTx, lastDistributeAt: await lastDistributes(d.sql, due) });
  const nowIso = isoAt(d.clock.now());
  const logs: KeeperLogRow[] = [];
  await d.sql.begin(async (tx) => {
    for (const o of report.outcomes) {
      // A dry run or a vault the keeper wallet owns would otherwise be read again every minute.
      const quiet = o.status === 'dry-run' || o.status === 'owner-wallet';
      await setNextCheck(tx, o.vault, quiet ? report.ranAt + RETRY_AFTER : o.nextCheckAt);
      if (o.status === 'owner-wallet') continue;
      if (o.status === 'idle' || o.status === 'limit') continue;
      logs.push({
        vault: o.vault,
        action: o.decision?.action ?? null,
        txHash: o.hash ?? failedHash(o.error?.details),
        status: o.status,
        error: o.error?.code ?? null,
        chainAt: report.ranAt,
      });
    }
    await logKeeper(tx, logs, nowIso);
  });
  for (const l of logs) {
    if (l.error !== null) d.log.warn('keeper attempt failed', { vault: l.vault, status: l.status, code: l.error });
  }
  await setMeta(
    d.sql,
    'keeper',
    {
      lastRunAt: nowIso,
      balanceWei: report.balance,
      dryRun: report.dryRun,
      keeper: report.keeper,
      sent: report.sent,
      stopped: report.stopped,
    },
    nowIso,
  );
  await opsAlert(
    d,
    'keeper-balance',
    report.stopped === 'LOW_BALANCE',
    `Keeper ${report.keeper ?? '(none)'} balance ${report.balance ?? 'unknown'} wei. It stops below 0.005 OKB; top it up.`,
  );
  return { ran: true, dryRun: report.dryRun, due: due.length, sent: report.sent, stopped: report.stopped };
}
