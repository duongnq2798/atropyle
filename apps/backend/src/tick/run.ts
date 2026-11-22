import type { ChainHead } from '../chain/port';
import type { Deps } from '../deps';
import { errorText } from '../log';
import { opsAlert } from '../ops';
import { releaseLease, tryLease } from '../store/meta';
import { type IndexResult, runIndexer } from './indexer';
import { type KeeperPhaseResult, runKeeperPhase } from './keeper';
import { type NoticeResult, runNotices } from './notices';

export const TICK_LEASE = 'lease:tick';
/** Longer than the 50 s budget plus the Edge Function's own limit, so a crashed run frees the lease in time. */
export const LEASE_TTL_MS = 120_000;

export interface TickResult {
  status: 'ok' | 'partial' | 'locked';
  head: bigint | null;
  indexer: IndexResult | null;
  notices: NoticeResult | null;
  keeper: KeeperPhaseResult | null;
  errors: string[];
}

/**
 * Spec §9.3: one minute's work under one lease and a 50 s budget. The indexer may use half of it, the notices run
 * until 70%, the keeper uses the rest. A failing phase is recorded in `errors` and the next phase still runs.
 */
export async function runTick(d: Deps): Promise<TickResult> {
  const start = d.clock.now();
  const result: TickResult = { status: 'locked', head: null, indexer: null, notices: null, keeper: null, errors: [] };
  if (!(await tryLease(d.sql, TICK_LEASE, start, LEASE_TTL_MS))) return result;
  const fail = (phase: string, e: unknown) => {
    result.errors.push(`${phase}: ${errorText(e)}`);
    d.log.error('tick phase failed', { phase, error: errorText(e) });
  };
  try {
    try {
      await opsAlert(d, 'keeper-key', d.keeperError !== null, d.keeperError ?? 'The keeper secret is usable again.');
    } catch (e) {
      fail('ops', e);
    }
    let head: ChainHead;
    try {
      head = await d.chain.head();
    } catch (e) {
      fail('head', e);
      return result;
    }
    result.head = head.number;
    const budget = d.config.budgetMs;
    try {
      result.indexer = await runIndexer(d, head, start + budget * 0.5);
      if (result.indexer.error !== null) result.errors.push(`indexer: ${result.indexer.error}`);
    } catch (e) {
      fail('indexer', e);
    }
    try {
      result.notices = await runNotices(d, head.timestamp, start + budget * 0.7, result.indexer?.caughtUp ?? false);
    } catch (e) {
      fail('notices', e);
    }
    try {
      result.keeper = await runKeeperPhase(d, head.timestamp, start + budget);
    } catch (e) {
      fail('keeper', e);
    }
    return result;
  } finally {
    result.status = result.errors.length === 0 ? 'ok' : 'partial';
    await releaseLease(d.sql, TICK_LEASE).catch((e) => d.log.error('lease not released', { error: errorText(e) }));
  }
}
