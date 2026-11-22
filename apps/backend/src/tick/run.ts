import type { ChainHead } from '../chain/port';
import type { Deps } from '../deps';
import { errorText } from '../log';
import { opsAlert } from '../ops';
import { leaseUntil, releaseLease, renewLease, tryLease } from '../store/meta';
import { checkIndexerLag, checkMail } from './alerts';
import { type IndexResult, runIndexer } from './indexer';
import { type KeeperPhaseResult, runKeeperPhase } from './keeper';
import { type NoticeResult, runNotices } from './notices';

export const TICK_LEASE = 'lease:tick';
/**
 * Longer than the 50 s budget, so a crashed run frees the lease soon. Supabase's Edge Function wall-clock limit is
 * 150 s (Free) or 400 s (paid), so a hung run can outlive it: a run therefore re-asserts the lease before each keeper
 * call that may send, stops keeping once another run holds it, and releases only the lease it wrote last.
 */
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
 * until 70%, the keeper uses the rest. A failing phase is recorded in `errors` and the next phase still runs. The
 * indexer-lag check runs on every tick, also when the head cannot be read; the mail check after the notices (I3).
 */
export async function runTick(d: Deps): Promise<TickResult> {
  const start = d.clock.now();
  const result: TickResult = { status: 'locked', head: null, indexer: null, notices: null, keeper: null, errors: [] };
  if (!(await tryLease(d.sql, TICK_LEASE, start, LEASE_TTL_MS))) return result;
  let until = leaseUntil(start, LEASE_TTL_MS);
  const holdLease = async (): Promise<boolean> => {
    const next = await renewLease(d.sql, TICK_LEASE, until, d.clock.now(), LEASE_TTL_MS);
    if (next === null) return false;
    until = next;
    return true;
  };
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
    let head: ChainHead | null = null;
    try {
      head = await d.chain.head();
    } catch (e) {
      fail('head', e);
    }
    const budget = d.config.budgetMs;
    if (head !== null) {
      result.head = head.number;
      try {
        result.indexer = await runIndexer(d, head, start + budget * 0.5);
        if (result.indexer.error !== null) result.errors.push(`indexer: ${result.indexer.error}`);
      } catch (e) {
        fail('indexer', e);
      }
    }
    try {
      await checkIndexerLag(d);
    } catch (e) {
      fail('ops', e);
    }
    if (head === null) return result;
    try {
      result.notices = await runNotices(d, head.timestamp, start + budget * 0.7, result.indexer?.caughtUp ?? false);
      await checkMail(d, result.notices);
    } catch (e) {
      fail('notices', e);
    }
    try {
      result.keeper = await runKeeperPhase(d, head.timestamp, start + budget, holdLease);
    } catch (e) {
      fail('keeper', e);
    }
    return result;
  } finally {
    result.status = result.errors.length === 0 ? 'ok' : 'partial';
    await releaseLease(d.sql, TICK_LEASE, until).catch((e) =>
      d.log.error('lease not released', { error: errorText(e) }),
    );
  }
}
