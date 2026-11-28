'use client';

import { useState } from 'react';
import { ApiError } from '@/api/client';
import type { ConfirmResponse } from '@/api/types';
import { ConfirmView } from '@/app/alerts/confirm/confirm-page';
import type { ConfirmState, UnsubscribeState } from '@/app/alerts/token';
import { UnsubscribeView } from '@/app/alerts/unsubscribe/unsubscribe-page';
import { useLocationHash } from '@/lib/hash';
import { useMounted } from '@/lib/use-mounted';

/**
 * The hosted states of the two email pages, one per document by the fragment (`/e2e/alerts/#confirm-done`), for axe
 * and the review screenshots (test/e2e/alerts.spec.ts). The e2e build is DeWEB, where the real pages stop at
 * "hostedOnly", so the views run here on stand-in props, and nothing leaves the page.
 */
const RESULT: ConfirmResponse = { ok: true, vault: '0x5FbDB2315678afecb367f032d93F642f64180aa3', role: 'heir' };
const EXPIRED = new ApiError('TOKEN_INVALID', 404, 'preview: token invalid');
const DOWN = new ApiError('NETWORK', null, 'preview: network');
const noop = () => undefined;

type Preview =
  | { kind: 'confirm'; state: ConfirmState; error?: unknown }
  | { kind: 'unsub'; state: UnsubscribeState; error?: unknown }
  | { kind: 'live' };

const PREVIEWS: Readonly<Record<string, Preview>> = {
  'confirm-working': { kind: 'confirm', state: 'working' },
  'confirm-done': { kind: 'confirm', state: 'done' },
  'confirm-expired': { kind: 'confirm', state: 'error', error: EXPIRED },
  'confirm-error': { kind: 'confirm', state: 'error', error: DOWN },
  'unsub-ready': { kind: 'unsub', state: 'ready' },
  'unsub-working': { kind: 'unsub', state: 'working' },
  'unsub-done': { kind: 'unsub', state: 'done' },
  'unsub-error': { kind: 'unsub', state: 'error', error: DOWN },
  'unsub-live': { kind: 'live' },
};

/** A press that settles after a moment, for the focus path of the real page. */
function LiveUnsubscribe() {
  const [state, setState] = useState<UnsubscribeState>('ready');
  const stop = () => {
    setState('working');
    setTimeout(() => setState('done'), 400);
  };
  return <UnsubscribeView state={state} error={null} onStop={stop} />;
}

export default function AlertsPreview() {
  const mounted = useMounted();
  const key = useLocationHash().slice(1);
  const p = Object.hasOwn(PREVIEWS, key) ? PREVIEWS[key] : undefined;
  if (!mounted || !p) return <p className="px-4 py-10 font-mono text-caption text-ink-muted">#{key}</p>;
  if (p.kind === 'live') return <LiveUnsubscribe />;
  return p.kind === 'confirm' ? (
    <ConfirmView state={p.state} result={p.state === 'done' ? RESULT : null} error={p.error ?? null} onRetry={noop} />
  ) : (
    <UnsubscribeView state={p.state} error={p.error ?? null} onStop={noop} />
  );
}
