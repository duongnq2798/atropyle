import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoadNotice } from '../../src/shell/load-notice';
import { MobileMenu } from '../../src/shell/mobile-menu';
import { SettingsMenu } from '../../src/shell/settings-menu';
import { ConnectSheetSlot } from '../../src/wallet/connect-sheet-slot';
import { WalletButton } from '../../src/wallet/wallet-button';
import { renderWithProviders } from '../helpers/render';
import { fakeWallet, walletWindow } from '../helpers/wallet';
import { PEOPLE } from './fixtures';

// Each overlay's chunk fails its next `fail` imports, as offline or after a deploy that replaced the hashed chunks,
// and otherwise waits for its gate, as a slow network would. The gate is open unless a test closes it.
const chunks = vi.hoisted(() => {
  const control = () => {
    const c = { imports: 0, fail: 0, ready: Promise.resolve(), open: () => {} };
    return Object.assign(c, {
      close() {
        c.ready = new Promise<void>((resolve) => {
          c.open = resolve;
        });
      },
    });
  };
  return { sheet: control(), settings: control(), menu: control() };
});

async function gated(c: (typeof chunks)['sheet'], load: () => Promise<unknown>) {
  c.imports += 1;
  if (c.fail > 0) {
    c.fail -= 1;
    throw new TypeError('Failed to fetch dynamically imported module');
  }
  await c.ready;
  return load();
}

vi.mock('../../src/wallet/connect-sheet', (importOriginal) => gated(chunks.sheet, importOriginal));
vi.mock('../../src/shell/settings-panel', (importOriginal) => gated(chunks.settings, importOriginal));
vi.mock('../../src/shell/menu-sheet', (importOriginal) => gated(chunks.menu, importOriginal));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSelectedLayoutSegment: () => null,
  useRouter: () => ({ push: () => undefined }),
}));

const notice = () => screen.getByTestId('load-notice');
const LOAD_FAILED = 'Part of this page did not load.';

describe('a press while the first load is on its way', () => {
  it('keeps the open pending and says the button is busy, so a second press does not cancel it', async () => {
    chunks.settings.close();
    renderWithProviders(<SettingsMenu />);
    const button = screen.getByRole('button', { name: 'Settings' });
    // A mouse press, with no hover or focus first, as a tap on a phone.
    fireEvent.click(button);
    await act(async () => {});
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();

    // The button still says "not open", so a second press asks again for what it announced.
    fireEvent.click(button);
    await act(async () => {});
    expect(button.getAttribute('aria-busy')).toBe('true');

    chunks.settings.open();
    const popover = await screen.findByRole('dialog', { name: 'Settings' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(popover.id);
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});

describe('a chunk that fails to load', () => {
  it('says so where everyone hears it, offers a reload, and the next press of Menu loads again', async () => {
    chunks.menu.fail = 1;
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
    renderWithProviders(
      <>
        <LoadNotice />
        <MobileMenu />
      </>,
    );
    expect(notice().textContent).toBe('');
    const button = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(button);
    await waitFor(() => expect(notice().textContent).toContain(LOAD_FAILED));
    expect(notice().getAttribute('role')).toBe('alert');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(chunks.menu.imports).toBe(1);

    // After a deploy replaced the hashed chunks of an open tab, only a reload helps; the reader decides when.
    fireEvent.click(screen.getByRole('button', { name: 'Reload the page' }));
    expect(reload).toHaveBeenCalledTimes(1);
    reload.mockRestore();

    fireEvent.click(button);
    await screen.findByRole('dialog', { name: 'Menu' });
    expect(chunks.menu.imports).toBe(2);
    expect(notice().textContent).toBe('');
  });

  it('closes the wallet sheet again with the same message, and the next press waits busy, then opens it', async () => {
    chunks.sheet.fail = 1;
    const info = { uuid: 'uuid-1', name: 'OKX Wallet', rdns: 'com.okex.wallet', icon: '' };
    renderWithProviders(
      <>
        <LoadNotice />
        <WalletButton />
        <ConnectSheetSlot />
      </>,
      { win: walletWindow([{ info, provider: fakeWallet({ accounts: [PEOPLE.owner] }).provider }]) },
    );
    const connect = screen.getByRole('button', { name: 'Connect wallet' });
    fireEvent.click(connect);
    await waitFor(() => expect(notice().textContent).toContain(LOAD_FAILED));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(connect.hasAttribute('aria-busy')).toBe(false);

    chunks.sheet.close();
    fireEvent.click(connect);
    await act(async () => {});
    expect(connect.getAttribute('aria-busy')).toBe('true');
    // Disabled, it would drop the focus of a keyboard user to the page.
    expect(connect).toBeEnabled();
    expect(screen.queryByRole('dialog')).toBeNull();

    chunks.sheet.open();
    await screen.findByRole('dialog', { name: 'Choose a wallet' });
    expect(connect.hasAttribute('aria-busy')).toBe(false);
    expect(notice().textContent).toBe('');
    // The sheet's search ends with the wallet's row, and nothing is left running after the test (its 250 ms wait
    // outlived the window once, and its late state update failed the run).
    await screen.findByText('OKX Wallet');
  });
});
