import type { Deps } from '../deps';
import { json, route } from '../http';
import { latestIntegrity } from '../store/integrity';
import { getMeta } from '../store/meta';

/** The updatedAt of a backend that has not run a tick yet: old enough for any monitor to flag. */
export const EPOCH = '1970-01-01T00:00:00.000Z';

interface IndexerMeta {
  block: string;
  head: string;
}

interface KeeperMeta {
  lastRunAt: string;
  balanceWei: string | null;
  dryRun: boolean;
}

/** GET /health (spec §9.6): index lag, the latest integrity run, the keeper. Never cached. */
export const health = route<Deps>({ method: 'GET', cors: 'public' }, async (_req, d) => {
  const idx = await getMeta<IndexerMeta>(d.sql, 'indexer');
  const indexer = idx
    ? {
        block: idx.value.block,
        lagBlocks: Number(BigInt(idx.value.head) - BigInt(idx.value.block)),
        updatedAt: idx.updatedAt,
      }
    : { block: '0', lagBlocks: 0, updatedAt: EPOCH };
  const integrity = await latestIntegrity(d.sql);
  const keeper = await getMeta<KeeperMeta>(d.sql, 'keeper');
  return json(
    {
      indexer,
      integrity,
      keeper: keeper
        ? { lastRunAt: keeper.value.lastRunAt, balanceWei: keeper.value.balanceWei ?? '0', dryRun: keeper.value.dryRun }
        : null,
    },
    200,
    { 'cache-control': 'no-store' },
  );
});
