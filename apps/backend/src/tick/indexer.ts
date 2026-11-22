import type { Address } from 'viem';
import type { ChainHead, VaultView } from '../chain/port';
import { isoAt } from '../clock';
import type { Deps } from '../deps';
import { errorText } from '../log';
import { getCursor, setCursor, setMeta } from '../store/meta';
import { insertCreated, insertEvents, knownVaults, saveView } from '../store/vaults';

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
  /** True when the cursor reached the target without an error: reminders may trust the stored views. */
  caughtUp: boolean;
  error: string | null;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Spec §9.3.1. One transaction per step; any failure stops the run and keeps the last committed cursor. */
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
    caughtUp: false,
    error: null,
  };
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
      for (const a of touched.values()) views.push(await d.chain.view(a));
      const nowIso = isoAt(d.clock.now());
      const inserted = await d.sql.begin(async (tx) => {
        for (const c of scan.created) await insertCreated(tx, c, nowIso);
        const n = await insertEvents(
          tx,
          scan.events.map((event) => ({ event, at: times.get(event.blockNumber) ?? 0n })),
        );
        for (const v of views) await saveView(tx, v, nowIso);
        await setCursor(tx, scan.toBlock, nowIso);
        return n;
      });
      r.steps++;
      r.created += scan.created.length;
      r.events += inserted;
      cursor = scan.toBlock;
      vaults = scan.cursor.vaults;
    } catch (e) {
      r.error = errorText(e);
      d.log.warn('indexer step failed', { from: cursor + 1n, to: stepEnd, error: r.error });
      break;
    }
  }
  r.to = cursor;
  r.caughtUp = r.error === null && cursor >= target;
  await setMeta(d.sql, 'indexer', { block: cursor, head: head.number }, isoAt(d.clock.now()));
  return r;
}
