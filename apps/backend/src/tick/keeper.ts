import { type KeeperOutcome, type KeeperReport, RETRY_AFTER } from '@atropyle/sdk';
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
  /** LOW_BALANCE: the keeper is below its minimum. LEASE_LOST: another run took the tick over, so this one stopped. */
  stopped: 'LOW_BALANCE' | 'LEASE_LOST' | null;
}

/** A broadcast that then failed (revert, unreadable receipt) reports its hash only in error.details.hash. */
function failedHash(details: unknown): Hex | null {
  const h = (details as { hash?: unknown } | undefined)?.hash;
  return typeof h === 'string' && isHex(h) && h.length === 66 ? h : null;
}

/** An outcome that used one of the run's attempts: the SDK simulated or sent something for it. */
const attempted = (o: KeeperOutcome) =>
  o.decision?.action != null && o.status !== 'owner-wallet' && o.status !== 'limit';

/**
 * Spec §9.3.3 with the limits of the ecosystem spec §9.4: at most keeperMaxTx (20) attempts, the SDK's gas cap,
 * a stop below 0.005 OKB. Runs even with no vault due, so the balance alert and /health stay current.
 *
 * The keeper is driven one vault at a time (I1). Before each vault the phase checks the time left and, since the
 * call may send, re-asserts the tick lease through `holdLease`; it stops when either is gone, so two overlapping runs
 * never both keep. Each outcome's keeper_log row and next_check_at are committed right after its call, and every
 * broadcast hash is logged before that write, so a failed write never loses it.
 */
export async function runKeeperPhase(
  d: Deps,
  now: bigint,
  deadlineMs: number,
  holdLease: () => Promise<boolean> = async () => true,
): Promise<KeeperPhaseResult> {
  const due = await dueVaults(d.sql, now);
  const result: KeeperPhaseResult = { ran: false, dryRun: true, due: due.length, sent: 0, stopped: null };
  const lastDistributeAt = await lastDistributes(d.sql, due);
  const budget = () => Math.floor((deadlineMs - d.clock.now()) / KEEPER_TX_MS);
  let attempts = 0;
  let last: KeeperReport | null = null;
  if (due.length === 0 && budget() >= 1) {
    // Nothing to keep: one call without vaults still reads the keeper's balance.
    last = await d.chain.keeper({ vaults: [], maxTx: 0, lastDistributeAt });
  }
  for (const vault of due) {
    const maxTx = Math.min(d.config.keeperMaxTx - attempts, budget());
    if (maxTx < 1) break;
    if (!(await holdLease())) {
      result.stopped = 'LEASE_LOST';
      break;
    }
    const report = await d.chain.keeper({ vaults: [vault], maxTx, lastDistributeAt });
    last = report;
    result.sent += report.sent;
    attempts += report.outcomes.filter(attempted).length;
    await commitOutcomes(d, report);
    if (report.stopped === 'LOW_BALANCE') break;
  }
  if (last === null) return result;
  const nowIso = isoAt(d.clock.now());
  result.ran = true;
  result.dryRun = last.dryRun;
  if (last.stopped === 'LOW_BALANCE') result.stopped = 'LOW_BALANCE';
  await setMeta(
    d.sql,
    'keeper',
    {
      lastRunAt: nowIso,
      balanceWei: last.balance,
      dryRun: last.dryRun,
      keeper: last.keeper,
      sent: result.sent,
      stopped: last.stopped,
    },
    nowIso,
  );
  await opsAlert(
    d,
    'keeper-balance',
    last.stopped === 'LOW_BALANCE',
    `Keeper ${last.keeper ?? '(none)'} balance ${last.balance ?? 'unknown'} wei. It stops below 0.005 OKB; top it up.`,
  );
  return result;
}

/**
 * Logs each broadcast hash, then commits the outcomes' next_check_at and keeper_log rows in one transaction. A dry
 * run, an idle vault, an owner-wallet vault and a vault over the limit get no keeper_log row: nothing was sent, and a
 * dry run would otherwise add a row per due vault every five minutes (M5).
 */
async function commitOutcomes(d: Deps, report: KeeperReport): Promise<void> {
  const logs: KeeperLogRow[] = [];
  for (const o of report.outcomes) {
    const hash = o.hash ?? failedHash(o.error?.details);
    if (hash !== null) d.log.info('keeper broadcast', { vault: o.vault, action: o.decision?.action ?? null, hash });
    if (o.status === 'dry-run' || o.status === 'owner-wallet' || o.status === 'idle' || o.status === 'limit') continue;
    logs.push({
      vault: o.vault,
      action: o.decision?.action ?? null,
      txHash: hash,
      status: o.status,
      error: o.error?.code ?? null,
      chainAt: report.ranAt,
    });
  }
  const nowIso = isoAt(d.clock.now());
  await d.sql.begin(async (tx) => {
    for (const o of report.outcomes) {
      // A dry run or a vault the keeper wallet owns would otherwise be read again every minute.
      const quiet = o.status === 'dry-run' || o.status === 'owner-wallet';
      await setNextCheck(tx, o.vault, quiet ? report.ranAt + RETRY_AFTER : o.nextCheckAt);
    }
    await logKeeper(tx, logs, nowIso);
  });
  for (const l of logs) {
    if (l.error !== null) d.log.warn('keeper attempt failed', { vault: l.vault, status: l.status, code: l.error });
  }
}
