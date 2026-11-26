'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfirm, useUnsubscribe } from '@/api/hooks';
import { getApi } from '@/api/instance';
import type { ConfirmResponse } from '@/api/types';
import { replaceHash, useLocationHash } from '@/lib/hash';
import { useMounted } from '@/lib/use-mounted';

/** The backend's token: 32 bytes in base64url, 43 characters (TOKEN_RE of apps/backend/src/crypto.ts, Decision 12). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** `t` of the fragment (`#t=<token>`, maybe followed by parameters a mail client added), only if it has that shape. */
export function readToken(hash: string): string | null {
  const t = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('t');
  return t !== null && TOKEN_RE.test(t) ? t : null;
}

export type HashToken = { status: 'reading' } | { status: 'invalid' } | { status: 'found'; token: string };

/**
 * The token of the fragment, read after hydration and cleared from the address bar at once (replaceHash, no history
 * entry), so it is in no history entry, screenshot or shared address. It follows the fragment: a second email link
 * opened in the same tab is read too. The page's own clear (`#`) keeps what was read. Read from the render's own
 * `hash`, so StrictMode's second effect run reads the same value.
 */
export function useHashToken(): HashToken {
  const mounted = useMounted();
  const hash = useLocationHash();
  const [read, setRead] = useState<HashToken>({ status: 'reading' });
  useEffect(() => {
    if (!mounted) return;
    if (hash === '' || hash === '#') {
      setRead((r) => (r.status === 'reading' ? { status: 'invalid' } : r));
      return;
    }
    const token = readToken(hash);
    setRead(token ? { status: 'found', token } : { status: 'invalid' });
    replaceHash('');
  }, [mounted, hash]);
  return read;
}

export type ConfirmState = 'reading' | 'invalid' | 'hostedOnly' | 'working' | 'done' | 'error';

export interface ConfirmFlow {
  state: ConfirmState;
  result: ConfirmResponse | null;
  error: Error | null;
  retry(): void;
}

/**
 * Double opt-in: the page confirms by itself, with one POST per token (Decision 11). The ref keeps that through
 * StrictMode's second effect run. The backend's confirm is idempotent, so Retry after a timeout is safe.
 */
export function useConfirmFlow(): ConfirmFlow {
  const read = useHashToken();
  const { mutate, data, error, status } = useConfirm();
  const hosted = getApi() !== null;
  const token = read.status === 'found' ? read.token : null;
  const sentFor = useRef<string | null>(null);
  useEffect(() => {
    if (token === null || !hosted || sentFor.current === token) return;
    sentFor.current = token;
    mutate(token);
  }, [token, hosted, mutate]);
  const retry = useCallback(() => {
    if (token !== null && hosted) mutate(token);
  }, [token, hosted, mutate]);
  let state: ConfirmState;
  if (read.status === 'reading') state = 'reading';
  else if (read.status === 'invalid') state = 'invalid';
  else if (!hosted) state = 'hostedOnly';
  else if (status === 'success') state = 'done';
  else if (status === 'error') state = 'error';
  // idle until the effect sends, then pending
  else state = 'working';
  return { state, result: data ?? null, error: error ?? null, retry };
}

export type UnsubscribeState = 'reading' | 'invalid' | 'hostedOnly' | 'ready' | 'working' | 'done' | 'error';

export interface UnsubscribeFlow {
  state: UnsubscribeState;
  error: Error | null;
  stop(): void;
}

/**
 * Nothing is sent until the person presses the button: mail scanners open links and may run scripts (Decision 11).
 * The ref holds a second press from mutate() until it settles; the mutation's own status reaches this closure only
 * at the next render (as `sending` of SubscribeForm).
 */
export function useUnsubscribeFlow(): UnsubscribeFlow {
  const read = useHashToken();
  const { mutate, error, status } = useUnsubscribe();
  const hosted = getApi() !== null;
  const token = read.status === 'found' ? read.token : null;
  const busy = useRef(false);
  const stop = useCallback(() => {
    if (token === null || !hosted || busy.current) return;
    busy.current = true;
    mutate(token, {
      onSettled: () => {
        busy.current = false;
      },
    });
  }, [token, hosted, mutate]);
  let state: UnsubscribeState;
  if (read.status === 'reading') state = 'reading';
  else if (read.status === 'invalid') state = 'invalid';
  else if (!hosted) state = 'hostedOnly';
  else if (status === 'success') state = 'done';
  else if (status === 'error') state = 'error';
  else if (status === 'pending') state = 'working';
  else state = 'ready';
  return { state, error: error ?? null, stop };
}
