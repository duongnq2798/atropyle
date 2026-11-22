import { type Address, getAddress, isAddress } from 'viem';
import { isoAt } from '../clock';
import { hmacHex, randomToken, sha256Hex } from '../crypto';
import type { Deps } from '../deps';
import { clientIp, HttpError, invalid, json, readJson, route } from '../http';
import { deliver } from '../mail/deliver';
import { confirmsLastHour, HOUR_MS, hit, retryAfterSeconds } from '../store/ratelimit';
import { upsertPending } from '../store/subscriptions';
import { isLang, isRole, type Lang, type Role } from '../types';

/** Spec §9.2: 5 sign-ups per hour per IP, 3 per hour per email. */
export const IP_LIMIT = 5;
export const EMAIL_LIMIT = 3;
/**
 * Confirm emails per rolling hour across all requests (I2). Plus-addressing beats the per-email limit, so this cap is
 * what keeps a flood of sign-ups from burning the Resend reputation that alarm emails depend on.
 */
export const CONFIRM_CAP_PER_HOUR = 200;

/** A practical check: one @, a dotted domain, no spaces, control characters or brackets, RFC 5321 lengths. */
export function isEmail(s: string): boolean {
  if (s.length < 3 || s.length > 254) return false;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x20 || c === 0x7f) return false;
  }
  if (/[<>()[\]\\,;:"]/.test(s)) return false;
  const at = s.indexOf('@');
  if (at < 1 || at !== s.lastIndexOf('@') || at > 64) return false;
  const domain = s.slice(at + 1);
  return /^[^.]+(\.[^.]+)+$/.test(domain) && !domain.startsWith('-');
}

export interface SubscribeInput {
  email: string;
  vault: Address;
  role: Role;
  lang: Lang;
  website: string;
}

export function parseSubscribe(body: Record<string, unknown>): SubscribeInput {
  const { vault, role, lang } = body;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const website = body.website ?? '';
  if (!isEmail(email)) throw invalid('email is not a valid email address.');
  if (typeof vault !== 'string' || !isAddress(vault, { strict: false })) throw invalid('vault is not an address.');
  if (!isRole(role)) throw invalid('role must be owner, guardian or heir.');
  if (!isLang(lang)) throw invalid('lang must be en or vi.');
  if (typeof website !== 'string') throw invalid('website must be a string.');
  return { email, vault: getAddress(vault), role, lang, website };
}

const rateLimited = (nowMs: number, seconds = retryAfterSeconds(nowMs)) =>
  new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.', {
    'retry-after': String(seconds),
  });

/**
 * POST /subscribe (spec §9.6). The answer is 202 { ok: true } whether or not the email is known; only a bad
 * request, an address that is not a vault or a rate limit gets another answer.
 */
export const subscribe = route<Deps>({ method: 'POST', cors: 'site' }, async (req, d) => {
  const input = parseSubscribe(await readJson(req));
  if (input.website.trim() !== '') return json({ ok: true }, 202);
  const now = d.clock.now();
  if ((await hit(d.sql, await hmacHex(d.config.tokenSecret, `ip:${clientIp(req)}`), now)) > IP_LIMIT) {
    throw rateLimited(now);
  }
  if ((await hit(d.sql, await hmacHex(d.config.tokenSecret, `email:${input.email}`), now)) > EMAIL_LIMIT) {
    throw rateLimited(now);
  }
  // Checked before the row is looked at, so a new and an active sign-up get the same answer.
  const confirms = await confirmsLastHour(d.sql, now);
  if (confirms.count >= CONFIRM_CAP_PER_HOUR) {
    const freesAt = (confirms.oldestMs ?? now) + HOUR_MS;
    throw rateLimited(now, Math.max(1, Math.ceil((freesAt - now) / 1000)));
  }
  if (!(await d.chain.isVault(input.vault))) {
    throw new HttpError(400, 'NOT_A_VAULT', 'This address is not an Atropyle vault on X Layer.');
  }
  const token = randomToken((n) => d.random(n));
  const confirmHash = await sha256Hex(token);
  const r = await upsertPending(d.sql, {
    email: input.email,
    vault: input.vault,
    role: input.role,
    lang: input.lang,
    confirmHash,
    tokenSecret: d.config.tokenSecret,
    nowIso: isoAt(now),
  });
  if (r.status === 'pending') {
    const sub = { id: r.id, email: input.email, lang: input.lang, role: input.role, vault: input.vault };
    // A new hash per request, so a repeated sign-up sends a fresh link; the email limit caps how often.
    await deliver(d, { sub, kind: 'confirm', periodKey: confirmHash, confirmToken: token });
  }
  return json({ ok: true }, 202);
});
