import { sha256Hex, TOKEN_RE } from '../crypto';
import type { Deps } from '../deps';
import { invalid, json, readJson, route } from '../http';
import { deleteByUnsubHash } from '../store/subscriptions';

/**
 * POST /unsubscribe (spec §9.6): { token } from the web page, or ?t=<token> with the RFC 8058 one-click body that
 * mail clients send without an Origin. Always 200 { ok: true } once a token is given, known or not.
 */
export const unsubscribe = route<Deps>({ method: 'POST', cors: 'site', strictOrigin: false }, async (req, d) => {
  let token = new URL(req.url).searchParams.get('t');
  if (token === null && (req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = await readJson(req);
    token = typeof body.token === 'string' ? body.token : null;
  }
  if (token === null || token === '') throw invalid('token is required.');
  if (TOKEN_RE.test(token)) await deleteByUnsubHash(d.sql, await sha256Hex(token));
  return json({ ok: true });
});
