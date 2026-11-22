import { isoAt } from '../clock';
import { sha256Hex, TOKEN_RE } from '../crypto';
import type { Deps } from '../deps';
import { HttpError, json, readJson, route } from '../http';
import { deliver } from '../mail/deliver';
import { confirmByHash } from '../store/subscriptions';

const tokenInvalid = () => new HttpError(404, 'TOKEN_INVALID', 'This link is not valid or has expired.');

/** POST /confirm { token } (spec §9.6): activates the subscription and sends the welcome email once. */
export const confirm = route<Deps>({ method: 'POST', cors: 'site' }, async (req, d) => {
  const { token } = await readJson(req);
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw tokenInvalid();
  const sub = await confirmByHash(d.sql, await sha256Hex(token), isoAt(d.clock.now()));
  if (!sub) throw tokenInvalid();
  if (sub.was === 'pending') await deliver(d, { sub, kind: 'welcome', periodKey: 'once' });
  return json({ ok: true, vault: sub.vault, role: sub.role });
});
