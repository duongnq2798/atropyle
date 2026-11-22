import type { Deps } from '../deps';
import { json, route } from '../http';
import { runTick } from '../tick/run';
import { requireCron } from './cron';

/** POST /tick, every minute from pg_cron (spec §9.3). The body is the TickResult, for net._http_response. */
export const tick = route<Deps>({ method: 'POST', cors: 'none' }, async (req, d) => {
  requireCron(req, d);
  return json(await runTick(d));
});
