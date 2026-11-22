import type { Mail } from '../../src/email/compose';

export const SITE = 'https://atropyle.test';
export const API = 'https://ref.supabase.co/functions/v1';

/** A browser POST from the site (origin) or, with origin: null, a server-to-server POST (mail client, pg_net). */
export function postJson(path: string, body: unknown, o: { origin?: string | null; ip?: string } = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': o.ip ?? '203.0.113.7',
  };
  if (o.origin !== null) headers.origin = o.origin ?? SITE;
  return new Request(`${API}/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

export function getReq(path: string, o: { origin?: string } = {}): Request {
  return new Request(`${API}/${path}`, { method: 'GET', headers: o.origin ? { origin: o.origin } : {} });
}

export async function bodyOf<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** The token after #t= in an email's confirm button or unsubscribe link. */
export function tokenFrom(mail: Mail, which: 'confirm' | 'unsubscribe'): string {
  const m = mail.text.match(new RegExp(`/alerts/${which}/#t=([A-Za-z0-9_-]{43})`));
  if (!m) throw new Error(`no ${which} token in the email`);
  return m[1];
}
