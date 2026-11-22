import type { Address } from 'viem';
import type { ChainHead, VaultView } from '../chain/port';
import { isoAt } from '../clock';
import type { Deps } from '../deps';
import { errorText } from '../log';
import { getCursor, getMeta, setCursor, setMeta } from '../store/meta';
import {
  countStaleViews,
  dueStaleViews,
  insertCreated,
  insertEvents,
  knownVaults,
  markStale,
  saveView,
  viewsInBackoff,
} from '../store/vaults';

export interface IndexResult {
  /** First block this run looked at. */
  from: bigint;
  /** The cursor after this run. */
  to: bigint;
  /** head − HEAD_MARGIN: how far the indexer may go. */
  target: bigint;
  steps: number;
  created: number;
  /** Events stored for the first time. */
  events: number;
  /** Vault views read and stored in this run, in steps and retries. */
  views: number;
  /** Vaults whose stored view is stale after this run (a read failed or did not happen in time). */
  staleViews: number;
  /** True when the cursor reached the target without an error: reminders may trust the stored views. */
  caughtUp: boolean;
  error: string | null;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/**
 * Spec §9.3.1. One transaction per step: the created vaults, the events, the views read and the cursor. A failing
 * scan stops the run and keeps the last committed cursor.
 *
 * Views are read per vault and never block a step (C2): a vault whose read fails, or which the step has no time left
 * to read, is marked stale and keeps its last good view; notices for its newer events wait (unnotifiedEvents). A
 * failing vault is not read again during its back-off. After the steps, stale views that are due are read again
 * with the time left.
 */
export async function runIndexer(d: Deps, head: ChainHead, deadlineMs: number): Promise<IndexResult> {
  const target = head.number - BigInt(d.config.headMargin);
  const start = (await getCursor(d.sql)) ?? d.chain.factoryBlock - 1n;
  const end = min(target, start + BigInt(d.config.maxBlocksPerRun));
  const r: IndexResult = {
    from: start + 1n,
    to: start,
    target,
    steps: 0,
    created: 0,
    events: 0,
    views: 0,
    staleViews: 0,
    caughtUp: false,
    error: null,
  };
  const backingOff = await viewsInBackoff(d.sql, isoAt(d.clock.now()));
  let vaults: Address[] = await knownVaults(d.sql);
  let cursor = start;
  while (cursor < end && d.clock.now() < deadlineMs) {
    const stepEnd = min(end, cursor + BigInt(d.config.stepBlocks));
    try {
      const scan = await d.chain.scan({ resume: { toBlock: cursor, vaults }, toBlock: stepEnd });
      if (scan.toBlock <= cursor) break;
      const times = new Map<bigint, bigint>();
      for (const e of scan.events) {
        if (!times.has(e.blockNumber)) times.set(e.blockNumber, await d.chain.blockTime(e.blockNumber));
      }
      const touched = new Map<string, Address>();
      for (const a of [...scan.created.map((c) => c.vault), ...scan.events.map((e) => e.address)]) {
        touched.set(a.toLowerCase(), a);
      }
      const views: VaultView[] = [];
      const failed: Address[] = [];
      const late: Address[] = [];
      for (const [key, a] of touched) {
        if (backingOff.has(key)) continue;
        if (d.clock.now() >= deadlineMs) {
          late.push(a);
          continue;
        }
        const v = await readView(d, a);
        if (v === null) failed.push(a);
        else views.push(v);
      }
      const nowIso = isoAt(d.clock.now());
      const inserted = await d.sql.begin(async (tx) => {
        for (const c of scan.created) await insertCreated(tx, c, nowIso);
        const n = await insertEvents(
          tx,
          scan.events.map((event) => ({ event, at: times.get(event.blockNumber) ?? 0n })),
        );
        for (const v of views) await saveView(tx, v, nowIso);
        for (const a of failed) await markStale(tx, a, nowIso, true);
        for (const a of late) await markStale(tx, a, nowIso, false);
        await setCursor(tx, scan.toBlock, nowIso);
        return n;
      });
      for (const a of failed) backingOff.add(a.toLowerCase());
      r.steps++;
      r.created += scan.created.length;
      r.events += inserted;
      r.views += views.length;
      cursor = scan.toBlock;
      vaults = scan.cursor.vaults;
    } catch (e) {
      r.error = errorText(e);
      d.log.warn('indexer step failed', { from: cursor + 1n, to: stepEnd, error: r.error });
      break;
    }
  }
  r.views += await retryStaleViews(d, deadlineMs);
  r.to = cursor;
  r.caughtUp = r.error === null && cursor >= target;
  r.staleViews = await countStaleViews(d.sql);
  const nowIso = isoAt(d.clock.now());
  // caughtUpAt: the last time the cursor reached head − margin (the first run starts the clock). The indexer-lag
  // alert compares it with the time, so a head that cannot be read counts as lag too.
  const prev = await getMeta<IndexerMeta>(d.sql, 'indexer');
  const caughtUpAt = cursor >= target ? nowIso : (prev?.value.caughtUpAt ?? nowIso);
  await setMeta(d.sql, 'indexer', { block: cursor, head: head.number, caughtUpAt }, nowIso);
  return r;
}

/** meta 'indexer': read by /health and by the indexer-lag alert. */
export interface IndexerMeta {
  block: string;
  head: string;
  caughtUpAt?: string;
}

/** One vault's view, or null when the read failed. Only the chain read is caught: a database error still throws. */
async function readView(d: Deps, vault: Address): Promise<VaultView | null> {
  try {
    return await d.chain.view(vault);
  } catch (e) {
    d.log.warn('vault view failed', { vault, error: errorText(e) });
    return null;
  }
}

/** Reads stale views whose retry time has come, until the deadline. Returns how many were stored. */
async function retryStaleViews(d: Deps, deadlineMs: number): Promise<number> {
  let stored = 0;
  for (const a of await dueStaleViews(d.sql, isoAt(d.clock.now()))) {
    if (d.clock.now() >= deadlineMs) break;
    const v = await readView(d, a);
    const nowIso = isoAt(d.clock.now());
    if (v === null) {
      await markStale(d.sql, a, nowIso, true);
      continue;
    }
    await d.sql.begin((tx) => saveView(tx, v, nowIso));
    stored++;
  }
  return stored;
}
