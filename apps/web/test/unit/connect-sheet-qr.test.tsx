import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WalletPicker } from '../../src/wallet/connect-sheet';
import { renderWithProviders } from '../helpers/render';

// The QR encoder's chunk fails to load (offline, or a deploy replaced the hashed chunks of an open tab).
vi.mock('../../src/ui/qr-code', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

describe('the no-wallet help when the QR code cannot load', () => {
  it('keeps the copy-link row instead of taking the page down', async () => {
    // React reports the caught error to the console; the test is about what the reader still sees.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderWithProviders(
        <WalletPicker
          wallets={[]}
          searching={false}
          connectingId={null}
          error={null}
          pageUrl="https://atropyle.example/create/"
          onPick={() => undefined}
          onSearch={() => undefined}
        />,
      );
      expect(await screen.findByText('Copy the link and open it in the OKX App browser on your phone.')).toBeTruthy();
      expect(screen.getByText('No wallet in this browser')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Look again' })).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole('img', { name: 'QR code for this page' })).toBeNull());
      expect(screen.queryByText(/Scan it with your phone/)).toBeNull();
    } finally {
      quiet.mockRestore();
    }
  });
});
