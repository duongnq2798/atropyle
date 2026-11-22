import { safeEqual } from '../crypto';
import type { Deps } from '../deps';
import { HttpError } from '../http';

/** tick and integrity answer only the pg_cron job, which sends CRON_SECRET from Vault (spec §9.3). */
export function requireCron(req: Request, d: Pick<Deps, 'config'>): void {
  if (!safeEqual(req.headers.get('x-cron-secret') ?? '', d.config.cronSecret)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing or wrong cron secret.');
  }
}
