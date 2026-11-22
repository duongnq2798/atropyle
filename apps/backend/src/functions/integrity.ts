import type { Deps } from '../deps';
import { json, route } from '../http';
import { runIntegrity } from '../integrity';
import { requireCron } from './cron';

/** POST /integrity, every ten minutes from pg_cron (spec §9.2). */
export const integrity = route<Deps>({ method: 'POST', cors: 'none' }, async (req, d) => {
  requireCron(req, d);
  return json(await runIntegrity(d));
});
