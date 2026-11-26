import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readToken, TOKEN_RE, useConfirmFlow, useHashToken, useUnsubscribeFlow } from '../../src/app/alerts/token';
import { makeWrapper } from '../helpers/render';

const fake = vi.hoisted(() => ({
  subscribe: vi.fn(),
  confirm: vi.fn(),
  unsubscribe: vi.fn(),
  me: vi.fn(),
  stats: vi.fn(),
  health: vi.fn(),
}));
const backend = vi.hoisted(() => ({ on: true }));
vi.mock('../../src/api/instance', () => ({ getApi: () => (backend.on ? fake : null) }));

const TOKEN = 'Ab3_-'.repeat(8).concat('xyz');
const OTHER = 'Zz9-_'.repeat(8).concat('abc');
const VAULT = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

function strict() {
  const { wrapper: Wrapper } = makeWrapper();
  return ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <Wrapper>{children}</Wrapper>
    </StrictMode>
  );
}

const open = (path: string) => window.history.replaceState(null, '', path);

beforeEach(() => {
  vi.resetAllMocks();
  backend.on = true;
});
afterEach(() => {
  vi.restoreAllMocks(); // the pushState spy of the first email test, even when an expect above it failed
  open('/');
});

describe('the token of an email link', () => {
  it('has the shape the backend hands out (apps/backend/src/crypto.ts)', () => {
    // A path, not new URL(…, import.meta.url): happy-dom's URL is not a file URL that fileURLToPath takes.
    const file = join(dirname(fileURLToPath(import.meta.url)), '../../../backend/src/crypto.ts');
    const crypto = readFileSync(file, 'utf8');
    expect(crypto).toContain(`export const TOKEN_RE = ${TOKEN_RE.toString()};`);
    expect(TOKEN).toHaveLength(43);
    expect(TOKEN_RE.test(TOKEN)).toBe(true);
  });

  it('is read from t= of the fragment only, whole, and nothing else passes', () => {
    expect(readToken(`#t=${TOKEN}`)).toBe(TOKEN);
    expect(readToken(`#t=${TOKEN}&utm_source=mail`)).toBe(TOKEN);
    expect(readToken(`#t=${TOKEN}x`)).toBeNull();
    expect(readToken(`#t=${TOKEN.slice(0, 42)}=`)).toBeNull();
    expect(readToken('#t=short')).toBeNull();
    expect(readToken(`#x=${TOKEN}`)).toBeNull();
    expect(readToken('#')).toBeNull();
    expect(readToken('')).toBeNull();
  });
});

describe('email links', () => {
  it('confirm with exactly one request, even in StrictMode, and take the token out of the address bar', async () => {
    open(`/alerts/confirm/#t=${TOKEN}`);
    fake.confirm.mockResolvedValue({ ok: true, vault: VAULT, role: 'heir' });
    // The token leaves by replaceState: no new history entry, so Back never brings it back (Review Focus 1).
    const push = vi.spyOn(window.history, 'pushState');
    const entries = window.history.length;
    const { result } = renderHook(() => useConfirmFlow(), { wrapper: strict() });
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(fake.confirm).toHaveBeenCalledTimes(1);
    expect(fake.confirm.mock.calls[0][0]).toBe(TOKEN);
    expect(result.current.result).toEqual({ ok: true, vault: VAULT, role: 'heir' });
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.href).not.toContain('t=');
    expect(push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(entries);
  });

  it('confirm a second link opened in the same tab once more, and the same link never twice', async () => {
    open(`/alerts/confirm/#t=${TOKEN}`);
    fake.confirm.mockResolvedValue({ ok: true, vault: VAULT, role: 'heir' });
    const { result } = renderHook(() => useConfirmFlow(), { wrapper: strict() });
    await waitFor(() => expect(result.current.state).toBe('done'));
    act(() => {
      open(`/alerts/confirm/#t=${OTHER}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(fake.confirm).toHaveBeenCalledTimes(2));
    expect(fake.confirm.mock.calls[1][0]).toBe(OTHER);
    act(() => {
      open(`/alerts/confirm/#t=${OTHER}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(fake.confirm).toHaveBeenCalledTimes(2);
  });

  it('retry a failed confirmation only when asked', async () => {
    open(`/alerts/confirm/#t=${TOKEN}`);
    fake.confirm.mockRejectedValueOnce(Object.assign(new Error('down'), { name: 'ApiError', code: 'NETWORK' }));
    fake.confirm.mockResolvedValueOnce({ ok: true, vault: VAULT, role: 'owner' });
    const { result } = renderHook(() => useConfirmFlow(), { wrapper: strict() });
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(fake.confirm).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(fake.confirm).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe only when the person presses the button, once, even pressed twice', async () => {
    open(`/alerts/unsubscribe/#t=${TOKEN}`);
    fake.unsubscribe.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useUnsubscribeFlow(), { wrapper: strict() });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(fake.unsubscribe).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain(TOKEN);
    act(() => {
      result.current.stop();
      result.current.stop();
    });
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fake.unsubscribe.mock.calls[0][0]).toBe(TOKEN);
  });

  it('unsubscribe a second link opened in the same tab only when pressed again, never with the first result', async () => {
    open(`/alerts/unsubscribe/#t=${TOKEN}`);
    fake.unsubscribe.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useUnsubscribeFlow(), { wrapper: strict() });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.state).toBe('done'));
    act(() => {
      open(`/alerts/unsubscribe/#t=${OTHER}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    // A's "Alerts stopped" is not B's: B's alerts keep coming until B is sent.
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    expect(window.location.href).not.toContain(OTHER);
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(fake.unsubscribe).toHaveBeenCalledTimes(2);
    expect(fake.unsubscribe.mock.calls[1][0]).toBe(OTHER);
  });

  it('do not carry a failed unsubscribe over to a second link', async () => {
    open(`/alerts/unsubscribe/#t=${TOKEN}`);
    fake.unsubscribe.mockRejectedValueOnce(Object.assign(new Error('down'), { name: 'ApiError', code: 'NETWORK' }));
    const { result } = renderHook(() => useUnsubscribeFlow(), { wrapper: strict() });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.state).toBe('error'));
    act(() => {
      open(`/alerts/unsubscribe/#t=${OTHER}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.error).toBeNull();
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('never show the first confirmation as the second link’s while the second is on its way', async () => {
    open(`/alerts/confirm/#t=${TOKEN}`);
    fake.confirm.mockResolvedValueOnce({ ok: true, vault: VAULT, role: 'heir' });
    let release: (v: unknown) => void = () => {};
    fake.confirm.mockReturnValueOnce(new Promise((r) => (release = r)));
    // States of the renders that have read the second token (a twin read updates in the same commit).
    const seen: string[] = [];
    const { result } = renderHook(
      () => {
        const flow = useConfirmFlow();
        const read = useHashToken();
        if (read.status === 'found' && read.token === OTHER) seen.push(flow.state);
        return flow;
      },
      { wrapper: strict() },
    );
    await waitFor(() => expect(result.current.state).toBe('done'));
    act(() => {
      open(`/alerts/confirm/#t=${OTHER}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(fake.confirm).toHaveBeenCalledTimes(2));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain('done');
    expect(result.current.result).toBeNull();
    await act(async () => release({ ok: true, vault: VAULT, role: 'owner' }));
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(result.current.result).toEqual({ ok: true, vault: VAULT, role: 'owner' });
  });

  it('send nothing for a malformed token, or when this build has no backend', async () => {
    open('/alerts/confirm/#t=short');
    const bad = renderHook(() => useConfirmFlow(), { wrapper: strict() });
    await waitFor(() => expect(bad.result.current.state).toBe('invalid'));
    expect(window.location.href).not.toContain('#t=');
    bad.unmount();

    open('/alerts/unsubscribe/');
    const none = renderHook(() => useUnsubscribeFlow(), { wrapper: strict() });
    await waitFor(() => expect(none.result.current.state).toBe('invalid'));
    none.unmount();

    backend.on = false;
    open(`/alerts/confirm/#t=${TOKEN}`);
    const deweb = renderHook(() => useConfirmFlow(), { wrapper: strict() });
    await waitFor(() => expect(deweb.result.current.state).toBe('hostedOnly'));
    expect(window.location.href).not.toContain(TOKEN);
    expect(fake.confirm).not.toHaveBeenCalled();
    expect(fake.unsubscribe).not.toHaveBeenCalled();
  });
});
