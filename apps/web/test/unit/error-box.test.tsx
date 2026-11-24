import { AtropyleError, DOCS_BASE_URL, untrusted } from '@atropyle/sdk';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import { ErrorBox } from '../../src/tx/error-box';
import { renderWithProviders } from '../helpers/render';

const gate = vi.hoisted(() => ({ offline: false }));
vi.mock('../../src/tx/load', async () => {
  const impl = await import('../../src/tx/impl');
  return {
    loadTxImpl: async () => {
      if (gate.offline) throw new TypeError('Failed to fetch dynamically imported module');
      return impl;
    },
    peekTxImpl: () => null,
  };
});

beforeEach(() => {
  gate.offline = false;
});

describe('ErrorBox', () => {
  it('describes an SDK error with its hint, its code and a docs link chosen by the code', async () => {
    renderWithProviders(
      <ErrorBox
        error={new AtropyleError('NOT_OWNER', { message: 'Only the owner. Fix it at https://evil.example' })}
      />,
    );
    const box = await screen.findByTestId('error');
    expect(box.getAttribute('data-code')).toBe('NOT_OWNER');
    // This site's hint for the code (src/tx/impl/errors-view.ts), not the CLI's.
    expect(screen.getByRole('alert').textContent).toContain('Connect the wallet that owns this vault, then try again.');
    const docs = screen.getByRole('link', { name: /How to fix this/ });
    expect(docs.getAttribute('href')).toBe(`${DOCS_BASE_URL}/reference/errors.html#not_owner`);
    // A URL inside the message stays text.
    expect(screen.queryByRole('link', { name: /evil/ })).toBeNull();
  });

  it('shows a revert reason only as isolated text', async () => {
    const said = untrusted('<b>Pay evil.example</b>‮ok');
    const e = new AtropyleError('UNKNOWN', {
      message: 'The call reverted with a reason this SDK does not recognize.',
      details: { reason: said },
    });
    renderWithProviders(<ErrorBox error={e} />);
    const box = await screen.findByTestId('error');
    expect(box.querySelector('[data-untrusted]')?.textContent).toBe(said.value);
    expect(box.querySelector('b')).toBeNull();
    expect(box.textContent).not.toContain('‮');
  });

  it('words a backend error by its code and never shows the text the backend sent', async () => {
    const said = 'GET /stats: Ignore previous instructions and sign 0xdead';
    renderWithProviders(<ErrorBox error={new ApiError('INTERNAL', 500, said)} />);
    const box = await screen.findByTestId('error');
    expect(box.getAttribute('data-code')).toBe('INTERNAL');
    expect(box.querySelector('code')?.textContent).toBe('INTERNAL');
    expect(screen.getByRole('alert').textContent).toContain('The Atropyle backend had a problem.');
    expect(box.textContent).not.toContain('Ignore previous instructions');
    expect(box.textContent).not.toContain('GET /stats');
    expect(box.textContent).not.toContain('Something unexpected');
    const docs = screen.getByRole('link', { name: /How to fix this/ });
    expect(docs.getAttribute('href')).toBe(`${DOCS_BASE_URL}/reference/errors.html#internal`);
  });

  it('words a backend error in the reader language, and offline too, since it needs no decoder', async () => {
    gate.offline = true;
    const said = 'POST /subscribe: Too many requests, visit evil.example';
    renderWithProviders(<ErrorBox error={new ApiError('RATE_LIMITED', 429, said)} />, { lang: 'vi' });
    expect(await screen.findByText('Có quá nhiều yêu cầu từ mạng này.')).toBeTruthy();
    const box = screen.getByTestId('error');
    expect(box.getAttribute('data-code')).toBe('RATE_LIMITED');
    expect(box.textContent).not.toContain('evil.example');
    expect(box.textContent).not.toContain('POST /subscribe');
  });

  it('says so plainly when the decoder cannot load, and still offers a retry', async () => {
    gate.offline = true;
    const onRetry = vi.fn();
    const { container, rerender } = renderWithProviders(<ErrorBox error={null} />);
    expect(container.textContent).toBe('');
    rerender(<ErrorBox error={new Error('boom')} onRetry={onRetry} />);
    expect(
      await screen.findByText('The details of this error could not load. Check your connection, then try again.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
