import { toIso } from '../db/sql';
import type { Deps } from '../deps';
import { json, route } from '../http';
import { getCursor } from '../store/meta';
import { vaultStats } from '../store/vaults';
import { EPOCH } from './health';

/** GET /stats (spec §9.6), cached for 60 s. */
export const stats = route<Deps>({ method: 'GET', cors: 'public' }, async (_req, d) => {
  const rows = await d.sql.query<{ updated_at: unknown }>("select updated_at from public.cursors where name = 'logs'");
  const updatedAt = rows.length === 0 ? EPOCH : toIso(rows[0].updated_at);
  const block = (await getCursor(d.sql)) ?? 0n;
  return json({ block, ...(await vaultStats(d.sql)), updatedAt }, 200, { 'cache-control': 'public, max-age=60' });
});
