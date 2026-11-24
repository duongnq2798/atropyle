import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LoadedVault } from '../../src/chain/types';
import { ConnectSheet } from '../../src/wallet/connect-sheet';
import { NetworkBanner } from '../../src/wallet/network-banner';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import type { ConnectedWallet, WalletOption } from '../../src/wallet/types';
import { useVaultRoles } from '../../src/wallet/use-vault-roles';
import { WalletButton } from '../../src/wallet/wallet-button';
import { renderWithProviders } from '../helpers/render';
import { type FakeWallet, fakeWallet, walletWindow } from '../helpers/wallet';
import { fixtureSnapshot, PEOPLE } from './fixtures';

// useVaultRoles reads the real rolesIn through peekChainImpl.
vi.mock('../../src/chain/load', async () => {
  const impl = await import('../../src/chain/impl');
  return { loadChainImpl: async () => impl, peekChainImpl: () => impl };
});

function option(over: Partial<WalletOption> = {}): WalletOption {
  return {
    id: 'okx',
    name: 'OKX Wallet',
    icon: null,
    rdns: 'com.okex.wallet',
    provider: fakeWallet().provider,
    source: 'eip6963',
    ...over,
  };
}

function walletValue(over: Partial<WalletValue> = {}): WalletValue {
  return {
    status: 'idle',
    wallet: null,
    expectedChainId: 196,
    wrongChain: false,
    wallets: null,
    discovering: false,
    discover: vi.fn(async () => []),
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchChain: vi.fn(async () => undefined),
    walletClient: vi.fn(),
    sheetOpen: false,
    openSheet: vi.fn(),
    setSheetOpen: vi.fn(),
    sheetOpener: { current: null },
    ...over,
  };
}

const on = (chainId: number, account: string = PEOPLE.owner): ConnectedWallet => ({
  option: option(),
  account: account as ConnectedWallet['account'],
  chainId,
});

function withWallet(ui: ReactElement, value: WalletValue) {
  const r = renderWithProviders(<WalletContext value={value}>{ui}</WalletContext>);
  return {
    ...r,
    update: (next: WalletValue) => r.rerender(<WalletContext value={next}>{ui}</WalletContext>),
  };
}

const fail = (code: string | number) => Object.assign(new Error(String(code)), { code });

describe('ConnectSheet', () => {
  it('looks for wallets when it opens, then lists them with OKX recommended', () => {
    const discover = vi.fn(async () => []);
    const r = withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, discovering: true, discover }));
    expect(screen.getByRole('dialog', { name: 'Choose a wallet' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Looking for wallets');

    const other = option({ id: 'other', name: 'Other wallet', rdns: 'org.example.wallet' });
    r.update(walletValue({ sheetOpen: true, wallets: [option(), other], discover }));
    expect(screen.getByRole('button', { name: /OKX Wallet/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Other wallet/ })).toBeTruthy();
    expect(screen.getAllByText('Recommended on X Layer')).toHaveLength(1);
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it('connects the wallet chosen and says why a connection failed', async () => {
    const okx = option();
    const connect = vi
      .fn()
      .mockRejectedValueOnce(fail('USER_REJECTED'))
      .mockRejectedValueOnce(fail(-32002))
      .mockRejectedValueOnce(new Error('boom'));
    withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [okx], connect }));
    const row = screen.getByRole('button', { name: /OKX Wallet/ });

    fireEvent.click(row);
    expect(await screen.findByText('You declined in your wallet. Nothing was shared.')).toBeTruthy();
    fireEvent.click(row);
    expect(await screen.findByText(/already has a request open/)).toBeTruthy();
    fireEvent.click(row);
    expect(await screen.findByText(/did not connect/)).toBeTruthy();
    expect(connect).toHaveBeenCalledWith(okx);
  });

  it('treats a wallet name as untrusted text and recommends by rdns only', () => {
    const evil = option({ id: 'evil', name: '<img src=x onerror=alert(1)> OKX', rdns: 'evil.example' });
    withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [evil] }));
    const name = screen.getByRole('dialog').querySelector('bdi[data-untrusted]');
    expect(name?.textContent).toBe('<img src=x onerror=alert(1)> OKX');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.queryByText('Recommended on X Layer')).toBeNull();
  });

  it('without a wallet, offers the page link and a QR code, never an app link', async () => {
    withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [] }));
    expect(screen.getByText('No wallet in this browser')).toBeTruthy();
    expect(await screen.findByRole('img', { name: 'QR code for this page' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(screen.getByRole('dialog').querySelector('a')).toBeNull();
  });

  it('says so when the first search fails, and when Look again fails', async () => {
    const offline = () => Promise.reject(new Error('offline'));
    const r = withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, discover: vi.fn(offline) }));
    // The searching status gives way to the error, so the error announces itself.
    expect((await screen.findByRole('alert')).textContent).toContain('Could not look for wallets');
    r.unmount();

    const discover = vi.fn(async (): Promise<WalletOption[]> => []);
    withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [], discover }));
    await waitFor(() => expect(discover).toHaveBeenCalledTimes(1));
    discover.mockImplementationOnce(offline);
    fireEvent.click(screen.getByRole('button', { name: 'Look again' }));
    expect(await screen.findByText(/Could not look for wallets/)).toBeTruthy();
    expect(screen.getByText('No wallet in this browser')).toBeTruthy();
  });

  it('keeps the row whose prompt is open focusable, and ignores a second press', () => {
    const connect = vi.fn(() => new Promise<ConnectedWallet>(() => undefined));
    const other = option({ id: 'other', name: 'Other wallet', rdns: 'org.example.wallet' });
    withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [option(), other], connect }));
    const row = screen.getByRole('button', { name: /OKX Wallet/ });
    act(() => row.focus());
    fireEvent.click(row);
    expect(row).not.toBeDisabled();
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAttribute('aria-busy', 'true');
    expect(document.activeElement).toBe(row);
    expect(screen.getByRole('button', { name: /Other wallet/ })).toBeDisabled();
    fireEvent.click(row);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('offers a link too long for a QR code for copying only', async () => {
    window.history.replaceState(null, '', `/sign/#p=${'a'.repeat(700)}`);
    try {
      withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [] }));
      expect(await screen.findByText(/too long for a QR code/)).toBeTruthy();
      expect(screen.queryByRole('img', { name: 'QR code for this page' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});

describe('WalletButton', () => {
  it('offers Connect, holds the place while it reconnects, then shows the account', () => {
    const openSheet = vi.fn();
    const r = withWallet(<WalletButton />, walletValue({ openSheet }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(openSheet).toHaveBeenCalledTimes(1);

    r.update(walletValue({ status: 'restoring' }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Reconnecting your wallet');

    r.update(walletValue({ status: 'connected', wallet: on(196) }));
    expect(screen.getByRole('button', { name: 'Wallet 0x7099 7970 … 17dc 79C8' })).toBeTruthy();

    r.update(walletValue({ status: 'connected', wallet: on(1), wrongChain: true }));
    expect(screen.getByRole('button', { name: 'Wallet 0x7099 7970 … 17dc 79C8, wrong network' })).toBeTruthy();
  });

  it('the wallet menu shows the full address, the network and Disconnect', async () => {
    const disconnect = vi.fn();
    withWallet(<WalletButton />, walletValue({ status: 'connected', wallet: on(196), disconnect }));
    fireEvent.click(screen.getByRole('button', { name: /^Wallet 0x7099/ }));
    const menu = await screen.findByRole('dialog', { name: 'Wallet' });
    expect(menu.querySelector(`[data-address="${PEOPLE.owner}"]`)).toBeTruthy();
    expect(menu.textContent).toContain('X Layer');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('NetworkBanner', () => {
  it('appears only on the wrong chain and switches when asked', async () => {
    const switchChain = vi.fn().mockRejectedValueOnce(fail('USER_REJECTED')).mockResolvedValueOnce(undefined);
    const r = withWallet(<NetworkBanner />, walletValue({ status: 'connected', wallet: on(196) }));
    expect(screen.queryByTestId('network-banner')).toBeNull();

    r.update(walletValue({ status: 'connected', wallet: on(1), wrongChain: true, switchChain }));
    expect(screen.getByTestId('network-banner').textContent).toContain(
      'Your wallet is on Ethereum. Atropyle runs on X Layer (chain 196).',
    );
    const button = screen.getByRole('button', { name: 'Switch to X Layer' });
    fireEvent.click(button);
    expect(await screen.findByText('You declined the switch. Switch to X Layer when you are ready.')).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(switchChain).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/You declined the switch/)).toBeNull());
  });
});

const OKX_INFO = { uuid: 'uuid-1', name: 'OKX Wallet', rdns: 'com.okex.wallet', icon: '' };

/** The header button, the banner and the sheet over the real WalletProvider and an in-memory wallet. */
function realWallet(fake: FakeWallet = fakeWallet({ accounts: [PEOPLE.owner] })) {
  renderWithProviders(
    <>
      <WalletButton />
      <NetworkBanner />
      <ConnectSheet />
    </>,
    { win: walletWindow([{ info: OKX_INFO, provider: fake.provider }]) },
  );
  return fake;
}

/** A keyboard press: the control has focus, then activates. fireEvent.click alone moves no focus. */
function press(el: HTMLElement) {
  act(() => el.focus());
  fireEvent.click(el);
}

const accountButton = () => screen.getByRole('button', { name: /^Wallet 0x7099/ });

async function connectByKeyboard() {
  press(screen.getByRole('button', { name: 'Connect wallet' }));
  // Discovery listens for EIP-6963 answers for 250 ms.
  press(await screen.findByRole('button', { name: /OKX Wallet/ }, { timeout: 2000 }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('wallet focus', () => {
  it('Escape on the sheet gives focus back to Connect', async () => {
    realWallet();
    const connect = screen.getByRole('button', { name: 'Connect wallet' });
    press(connect);
    fireEvent.keyDown(await screen.findByRole('dialog', { name: 'Choose a wallet' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(connect));
  });

  it('a connection closes the sheet onto the account button, and Disconnect lands on Connect', async () => {
    realWallet();
    await connectByKeyboard();
    await waitFor(() => expect(document.activeElement).toBe(accountButton()));

    press(accountButton());
    press(await screen.findByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Connect wallet' })));
  });

  it('a switch from the banner lands on the account button, which now names the right network', async () => {
    realWallet(fakeWallet({ accounts: [PEOPLE.owner], chainId: 1 }));
    await connectByKeyboard();
    press(await screen.findByRole('button', { name: 'Switch to X Layer' }));
    await waitFor(() => expect(screen.queryByTestId('network-banner')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Wallet 0x7099 7970 … 17dc 79C8' })),
    );
  });

  it('a switch from the wallet menu keeps focus on the account button, not the page', async () => {
    realWallet(fakeWallet({ accounts: [PEOPLE.owner], chainId: 1 }));
    await connectByKeyboard();
    press(accountButton());
    const menu = await screen.findByRole('dialog', { name: 'Wallet' });
    const inMenu = [...menu.querySelectorAll('button')].find((b) => b.textContent === 'Switch to X Layer');
    if (!inMenu) throw new Error('no Switch button in the menu');
    press(inMenu);
    await waitFor(() => expect(screen.queryByTestId('network-banner')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(accountButton()));
  });
});

function Roles({ loaded }: { loaded: LoadedVault | undefined }) {
  return <output>{JSON.stringify(useVaultRoles(loaded))}</output>;
}

describe('useVaultRoles', () => {
  it('gives the connected account its roles, none without a wallet, and null before the vault loads', () => {
    const loaded = {
      snap: fixtureSnapshot(),
      timeline: null,
      registered: true,
      fetchedAtMs: 0,
    } as unknown as LoadedVault;
    const read = () => JSON.parse(screen.getByRole('status').textContent ?? '');
    const r = renderWithProviders(
      <WalletContext value={walletValue({ status: 'connected', wallet: on(196) })}>
        <Roles loaded={loaded} />
      </WalletContext>,
    );
    expect(read()).toEqual(['owner']);
    r.rerender(
      <WalletContext value={walletValue({ status: 'connected', wallet: on(196, PEOPLE.heirB) })}>
        <Roles loaded={loaded} />
      </WalletContext>,
    );
    expect(read()).toEqual(['heir', 'guardian']);
    r.rerender(
      <WalletContext value={walletValue()}>
        <Roles loaded={loaded} />
      </WalletContext>,
    );
    expect(read()).toEqual([]);
    r.rerender(
      <WalletContext value={walletValue()}>
        <Roles loaded={undefined} />
      </WalletContext>,
    );
    expect(read()).toBeNull();
  });
});
