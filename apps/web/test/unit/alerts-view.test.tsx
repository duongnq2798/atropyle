import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import type { ConfirmResponse } from '../../src/api/types';
import { ConfirmPage, ConfirmView } from '../../src/app/alerts/confirm/confirm-page';
import { UnsubscribeView } from '../../src/app/alerts/unsubscribe/unsubscribe-page';
import { renderWithProviders } from '../helpers/render';

vi.mock('../../src/api/instance', () => ({ getApi: () => null }));
// ErrorBox words an error through the tx chunk; here it loads at once (proof-view.test.tsx).
vi.mock('../../src/tx/load', async () => {
  const impl = await import('../../src/tx/impl');
  return { loadTxImpl: async () => impl, peekTxImpl: () => null };
});
vi.mock('next/navigation', () => ({
  usePathname: () => '/alerts/confirm/',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

const VAULT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const TOKEN = 'Ab3_-'.repeat(8).concat('xyz');
const DONE: ConfirmResponse = { ok: true, vault: VAULT, role: 'heir' };
const noop = () => undefined;

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('the confirm page', () => {
  it('says the alerts are on, for which vault and role, and what that role is sent', () => {
    renderWithProviders(<ConfirmView state="done" result={DONE} error={null} onRetry={noop} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Your email alerts are on' })).toBeInTheDocument();
    const root = screen.getByTestId('alerts');
    expect(root).toHaveAttribute('data-state', 'done');
    expect(root.querySelector(`[data-address="${VAULT}"]`)).not.toBeNull();
    expect(within(root).getByText('Heir')).toBeInTheDocument();
    expect(
      within(root).getByText(
        'An email if the alarm is raised, and the steps to receive your share when the time comes.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the vault' })).toHaveAttribute('href', `/vault/#${VAULT}`);
    expect(screen.getByTestId('alerts-token-note')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy/');
  });

  it('calls an unknown token expired, with no Retry, and points to the vaults', () => {
    renderWithProviders(
      <ConfirmView state="error" result={null} error={new ApiError('TOKEN_INVALID', 404, 'x')} onRetry={noop} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'This link no longer works' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find your vaults' })).toHaveAttribute('href', '/me/');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByTestId('error')).toBeNull();
  });

  it('shows any other failure in the error box, whose Retry asks again', () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <ConfirmView state="error" result={null} error={new ApiError('NETWORK', null, 'x')} onRetry={onRetry} />,
    );
    const box = screen.getByTestId('error');
    expect(box).toHaveAttribute('data-code', 'NETWORK');
    fireEvent.click(within(box).getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says a link without its token is incomplete, and mentions the cleared token only once one was read', () => {
    const first = renderWithProviders(<ConfirmView state="invalid" result={null} error={null} onRetry={noop} />);
    expect(screen.getByRole('heading', { level: 1, name: 'This link is incomplete' })).toBeInTheDocument();
    expect(screen.queryByTestId('alerts-token-note')).toBeNull();
    first.unmount();
    renderWithProviders(<ConfirmView state="hostedOnly" result={null} error={null} onRetry={noop} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Email alerts live on the main site' })).toBeInTheDocument();
    expect(screen.getByTestId('alerts-token-note')).toBeInTheDocument();
  });

  it('on this build reads the token, clears it and never shows it', async () => {
    window.history.replaceState(null, '', `/alerts/confirm/#t=${TOKEN}`);
    renderWithProviders(<ConfirmPage />);
    await waitFor(() => expect(screen.getByTestId('alerts')).toHaveAttribute('data-state', 'hostedOnly'));
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(window.location.href).not.toContain(TOKEN);
  });
});

describe('the unsubscribe page', () => {
  it('stops only on a press, keeps the focus on the busy button, then moves it to the title', () => {
    const onStop = vi.fn();
    const r = renderWithProviders(<UnsubscribeView state="ready" error={null} onStop={onStop} />);
    const stop = screen.getByTestId('alerts-stop');
    expect(stop).toHaveTextContent('Stop alerts');
    expect(onStop).not.toHaveBeenCalled();
    act(() => stop.focus());
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
    r.rerender(<UnsubscribeView state="working" error={null} onStop={onStop} />);
    expect(screen.getByTestId('alerts-stop')).toHaveAttribute('aria-busy', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('alerts-stop'));
    r.rerender(<UnsubscribeView state="done" error={null} onStop={onStop} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Alerts stopped' })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.getElementById('alerts-title'));
    expect(screen.queryByTestId('alerts-stop')).toBeNull();
  });

  it('moves the focus to the title when stopping fails, and the error box tries again', () => {
    const onStop = vi.fn();
    const r = renderWithProviders(<UnsubscribeView state="working" error={null} onStop={onStop} />);
    r.rerender(<UnsubscribeView state="error" error={new ApiError('INTERNAL', 500, 'x')} onStop={onStop} />);
    expect(document.activeElement).toBe(document.getElementById('alerts-title'));
    fireEvent.click(within(screen.getByTestId('error')).getByRole('button', { name: 'Retry' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
