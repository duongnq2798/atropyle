import { AtropyleError, DOCS_BASE_URL, ERROR_INFO, untrusted } from '@atropyle/sdk';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(screen.getByRole('alert').textContent).toContain(ERROR_INFO.NOT_OWNER.hint);
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
