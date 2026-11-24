import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { lazyChunk } from '../../src/lib/lazy-chunk';
import { MobileMenu } from '../../src/shell/mobile-menu';
import { SettingsMenu } from '../../src/shell/settings-menu';
import { ConnectSheetSlot } from '../../src/wallet/connect-sheet-slot';
import { WalletButton } from '../../src/wallet/wallet-button';
import { renderWithProviders } from '../helpers/render';
import { fakeWallet, walletWindow } from '../helpers/wallet';
import { PEOPLE } from './fixtures';

// Each overlay's chunk stays unloaded until the test opens its gate, as a slow network would keep it: the first open
// must wait for it, and the import must start on hover or focus of the button, before the press (ruling R23).
const chunks = vi.hoisted(() => {
  const gate = () => {
    let open = () => {};
    const ready = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { imports: 0, ready, open: () => open() };
  };
  return { sheet: gate(), settings: gate(), menu: gate() };
});

vi.mock('../../src/wallet/connect-sheet', async (importOriginal) => {
  chunks.sheet.imports += 1;
  await chunks.sheet.ready;
  return importOriginal();
});
vi.mock('../../src/shell/settings-panel', async (importOriginal) => {
  chunks.settings.imports += 1;
  await chunks.settings.ready;
  return importOriginal();
});
vi.mock('../../src/shell/menu-sheet', async (importOriginal) => {
  chunks.menu.imports += 1;
  await chunks.menu.ready;
  return importOriginal();
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSelectedLayoutSegment: () => null,
  useRouter: () => ({ push: () => undefined }),
}));

/** A keyboard press: the control has focus, then activates. fireEvent.click alone moves no focus. */
function press(el: HTMLElement) {
  act(() => el.focus());
  fireEvent.click(el);
}

/**
 * A mouse press, as a browser fires it: Radix dismisses a popover on the click that ends a press outside it. It
 * moves no focus, as in Safari, which does not focus a button on a press: the popover must give focus back itself.
 */
function click(el: HTMLElement) {
  fireEvent.pointerDown(el);
  fireEvent.mouseDown(el);
  fireEvent.pointerUp(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

const inside = (el: HTMLElement) => el.contains(document.activeElement);
/** Radix listens for a press outside from the task after a popover opens. */
const nextTask = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('the wallet sheet loads on its first open (ruling R23)', () => {
  it('starts the import on hover, waits for it on the first press, then traps focus and gives it back', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner] });
    const info = { uuid: 'uuid-1', name: 'OKX Wallet', rdns: 'com.okex.wallet', icon: '' };
    renderWithProviders(
      <>
        <WalletButton />
        <ConnectSheetSlot />
      </>,
      { win: walletWindow([{ info, provider: fake.provider }]) },
    );
    const connect = screen.getByRole('button', { name: 'Connect wallet' });
    expect(chunks.sheet.imports).toBe(0);

    fireEvent.pointerEnter(connect);
    await waitFor(() => expect(chunks.sheet.imports).toBe(1));

    // The press comes before the chunk: nothing opens yet, and the press starts no second import.
    press(connect);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chunks.sheet.imports).toBe(1);

    chunks.sheet.open();
    const sheet = await screen.findByRole('dialog', { name: 'Choose a wallet' });
    await waitFor(() => expect(inside(sheet)).toBe(true));

    // The trap: focus that leaves the modal sheet is put back inside it.
    act(() => connect.focus());
    expect(inside(sheet)).toBe(true);

    fireEvent.keyDown(document.activeElement ?? sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(connect));
    expect(chunks.sheet.imports).toBe(1);
  });
});

describe('the settings popover loads on its first open (ruling R23)', () => {
  it('is a real button that loads on focus, opens when the chunk arrives, and closes back onto itself', async () => {
    renderWithProviders(<SettingsMenu />);
    const button = screen.getByRole('button', { name: 'Settings' });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.hasAttribute('aria-controls')).toBe(false);
    expect(chunks.settings.imports).toBe(0);

    act(() => button.focus());
    await waitFor(() => expect(chunks.settings.imports).toBe(1));

    fireEvent.click(button);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');

    chunks.settings.open();
    const popover = await screen.findByRole('dialog', { name: 'Settings' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(popover.id);
    await waitFor(() => expect(inside(popover)).toBe(true));

    fireEvent.keyDown(document.activeElement ?? popover, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('a press on its button closes it onto the button, and a press elsewhere closes it and leaves focus', async () => {
    chunks.settings.open();
    renderWithProviders(<SettingsMenu />);
    const button = screen.getByRole('button', { name: 'Settings' });
    press(button);
    await screen.findByRole('dialog', { name: 'Settings' });
    await nextTask();

    click(button);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
    expect(button.getAttribute('aria-expanded')).toBe('false');

    // A press elsewhere is the reader moving on: focus is not pulled back to the button.
    click(button);
    await screen.findByRole('dialog', { name: 'Settings' });
    await nextTask();
    click(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).not.toBe(button);
  });
});

describe('the menu sheet loads on its first open (ruling R23)', () => {
  it('loads on hover, opens by keyboard once loaded, holds focus and gives it back to Menu', async () => {
    renderWithProviders(<MobileMenu />);
    const button = screen.getByRole('button', { name: 'Menu' });
    fireEvent.pointerEnter(button);
    await waitFor(() => expect(chunks.menu.imports).toBe(1));

    press(button);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();

    chunks.menu.open();
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(sheet.id);
    await waitFor(() => expect(inside(sheet)).toBe(true));
    act(() => button.focus());
    expect(inside(sheet)).toBe(true);

    fireEvent.keyDown(document.activeElement ?? sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});

describe('lazyChunk', () => {
  it('imports once, however often it is asked, and tries again after a failure', async () => {
    let calls = 0;
    let fail = true;
    const chunk = lazyChunk(async () => {
      calls += 1;
      if (fail) throw new Error('offline');
      return { value: 7 };
    });
    expect(chunk.peek()).toBeNull();
    chunk.preload();
    await expect(chunk.load()).rejects.toThrow('offline');
    expect(calls).toBe(1);

    fail = false;
    const [a, b] = await Promise.all([chunk.load(), chunk.load()]);
    expect(a).toBe(b);
    expect(chunk.peek()).toEqual({ value: 7 });
    chunk.preload();
    await chunk.load();
    expect(calls).toBe(2);
  });
});
