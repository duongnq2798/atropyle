// Web Crypto only (globalThis.crypto): identical in Node 24 and in Supabase's Deno runtime.
const enc = new TextEncoder();

const hex = (b: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

async function hmac(secret: string, s: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(s)));
}

export async function hmacHex(secret: string, s: string): Promise<string> {
  return hex(await hmac(secret, s));
}

export async function hmacB64url(secret: string, s: string): Promise<string> {
  return b64url(await hmac(secret, s));
}

/** Every token the backend hands out: 32 bytes as base64url, 43 characters. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function randomToken(random: (size: number) => Uint8Array): string {
  return b64url(random(32));
}

/**
 * The unsubscribe token of a subscription (plan 8 ruling 7). Derived, so every email can carry it while the
 * database keeps only its SHA-256 (unsub_hash).
 */
export function unsubToken(secret: string, subscriptionId: string): Promise<string> {
  return hmacB64url(secret, `unsub:${subscriptionId}`);
}

/** Constant-time comparison for secrets (the cron header). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
