import { AtropyleError } from '@atropyle/sdk';
import { focusManager } from '@tanstack/react-query';
import { act, fireEvent, screen, within } from '@testing-library/react';
import type { Address } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MePage } from '../../src/app/me/me-page';
import type { MyVault, MyVaults } from '../../src/chain/impl/my-vaults';
import { myVaultsKey } from '../../src/chain/use-my-vaults';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import { renderWithProviders } from '../helpers/render';
import { TEST_ACCOUNT, walletValue } from '../helpers/wallet';
import { PEOPLE } from './fixtures';

const fake = vi.hoisted(() => ({ myVaults: vi.fn() }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: () => ({ atro: {}, deployment: fixtureDeployment(), rpc: { read: [], verify: [] } }),
    myVaults: fake.myVaults,
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});
// ErrorBox words an error through the tx chunk; here it loads at once (proof-view.test.tsx).
vi.mock('../../src/tx/load', async () => {
  const impl = await import('../../src/tx/impl');
  return { loadTxImpl: async () => impl, peekTxImpl: () => null };
});
vi.mock('next/navigation', () => ({
  usePathname: () => '/me/',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

const V1 = '0x1111111111111111111111111111111111111111';
const V2 = '0x2222222222222222222222222222222222222222';
const V3 = '0x3333333333333333333333333333333333333333';
const mv = (vault: Address, roles: MyVault['roles'], over: Partial<MyVault> = {}): MyVault => ({
  vault,
  owner: PEOPLE.owner,
  drill: true,
  state: 'active',
  roles,
  expired: false,
  ...over,
});
const list = (vaults: MyVault[], over: Partial<MyVaults> = {}): MyVaults => ({
  vaults,
  indexed: BigInt(vaults.length),
  limit: 100,
  blockNumber: 1n,
  ...over,
});
const page = (over: Partial<WalletValue> = {}) => (
  <WalletContext value={walletValue(over)}>
    <MePage />
  </WalletContext>
);
const idle = { status: 'idle', wallet: null } as const;

function rowOf(section: HTMLElement, vault: string): HTMLElement {
  const row = within(section)
    .queryAllByTestId('me-row')
    .find((r) => r.dataset.vault === vault);
  if (!row) throw new Error(`no row for ${vault}`);
  return row;
}
const vaultsIn = (section: HTMLElement) =>
  within(section)
    .queryAllByTestId('me-row')
    .map((r) => r.dataset.vault);

afterEach(() => {
  fake.myVaults.mockReset();
  // As chain-hooks.test.tsx: a test that fakes the timers or the tab's focus leaves neither behind.
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe('/me/ without a wallet', () => {
  it('shows the connect card, the command with a placeholder, and reads nothing', () => {
    renderWithProviders(page(idle));
    expect(screen.getByRole('heading', { level: 1, name: 'My vaults' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Connect a wallet to see its vaults' })).toBeInTheDocument();
    expect(screen.getByTestId('me-connect')).toHaveTextContent('Connect wallet');
    expect(screen.getByTestId('me-cli')).toHaveTextContent('npx -y atropyle vaults <address>');
    expect(screen.getByTestId('me-status')).toHaveTextContent('');
    expect(fake.myVaults).not.toHaveBeenCalled();
  });

  it('names the three lists it will read, in their order', () => {
    renderWithProviders(page(idle));
    const preview = screen.getByRole('list', { name: 'The three lists this page reads' });
    expect(
      within(preview)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Owner', 'Guardian', 'Heir']);
  });

  it('Connect opens the wallet sheet, which gives focus back to the title once the button is gone', () => {
    const openSheet = vi.fn();
    renderWithProviders(page({ ...idle, openSheet }));
    fireEvent.click(screen.getByTestId('me-connect'));
    expect(openSheet).toHaveBeenCalledTimes(1);
    const fallback = openSheet.mock.calls[0][0] as () => HTMLElement | null;
    expect(fallback()).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('while the wallet reconnects, says so instead of offering Connect', () => {
    renderWithProviders(page({ status: 'restoring', wallet: null }));
    expect(screen.queryByTestId('me-connect')).toBeNull();
    expect(screen.getByTestId('me-loading')).toHaveTextContent('Reconnecting your wallet…');
    expect(fake.myVaults).not.toHaveBeenCalled();
  });
});

describe('/me/ with a wallet', () => {
  it('reads the connected account and says it is reading', async () => {
    fake.myVaults.mockReturnValue(new Promise<never>(() => undefined));
    renderWithProviders(page());
    // toHaveTextContent folds every \s of the element (U+00A0 included) into a space and matches the expected
    // string as given, so the expected text has a plain space; the raw textContent pins the glue.
    expect(await screen.findByTestId('me-loading')).toHaveTextContent('Reading your vaults from X Layer…');
    expect(screen.getByTestId('me-status')).toHaveTextContent('Reading your vaults from X Layer…');
    expect(screen.getByTestId('me-loading').textContent).toContain('X\u00A0Layer');
    expect(screen.getByTestId('me-status').textContent).toContain('X\u00A0Layer');
    await vi.waitFor(() => expect(fake.myVaults).toHaveBeenCalledWith(expect.anything(), TEST_ACCOUNT));
  });

  it('lists each vault under every role the wallet has in it, with its state from the chain', async () => {
    fake.myVaults.mockResolvedValue(
      list([
        mv(V1, ['owner']),
        mv(V2, ['heir', 'guardian'], { state: 'grace', owner: PEOPLE.g1 }),
        mv(V3, ['heir'], { expired: true, owner: PEOPLE.g2 }),
      ]),
    );
    renderWithProviders(page());
    const own = await screen.findByTestId('me-section-own');
    const guard = screen.getByTestId('me-section-guard');
    const inherit = screen.getByTestId('me-section-inherit');
    expect(vaultsIn(own)).toEqual([V1]);
    expect(vaultsIn(guard)).toEqual([V2]);
    expect(vaultsIn(inherit)).toEqual([V2, V3]);
    expect(rowOf(guard, V2).dataset.state).toBe('grace');
    expect(rowOf(guard, V2)).toHaveTextContent('You are an heir too');
    expect(rowOf(inherit, V2)).toHaveTextContent('You guard it too');
    expect(rowOf(inherit, V3).dataset.state).toBe('expired');
    expect(rowOf(inherit, V3)).toHaveTextContent('Drill expired');
    // A guardian or an heir knows a vault by its owner; the owner's own list does not repeat the wallet.
    expect(rowOf(guard, V2).querySelector(`[data-address="${PEOPLE.g1}"]`)).not.toBeNull();
    expect(within(rowOf(own, V1)).queryByText('Owner')).toBeNull();
    expect(within(rowOf(own, V1)).getByRole('link', { name: `Open vault ${V1}` })).toHaveAttribute(
      'href',
      `/vault/#${V1}`,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Vaults you own' })).toBeInTheDocument();
    expect(screen.getByTestId('me-status')).toHaveTextContent('3 vaults name this wallet.');
    expect(screen.getByTestId('me-named')).toBeInTheDocument();
    expect(screen.queryByTestId('me-truncated')).toBeNull();
    expect(screen.getByTestId('me-cli')).toHaveTextContent(`npx -y atropyle vaults ${TEST_ACCOUNT}`);
  });

  it('an empty list says so, and the empty list of owned vaults offers the rehearsal', async () => {
    fake.myVaults.mockResolvedValue(list([mv(V2, ['heir'])]));
    renderWithProviders(page());
    const empty = await screen.findByTestId('me-section-own-empty');
    expect(within(empty).getByRole('link', { name: 'Rehearse one in about 6 minutes' })).toHaveAttribute(
      'href',
      '/create/#drill',
    );
    expect(screen.getByTestId('me-section-guard-empty')).toHaveTextContent(
      /^No vault names this wallet as a guardian\.$/,
    );
    expect(within(screen.getByTestId('me-section-own')).queryByText("You check in from each vault's page.")).toBeNull();
    expect(screen.getByTestId('me-status')).toHaveTextContent('One vault names this wallet.');
  });

  it('a wallet that no vault names gets the empty state and the rehearsal', async () => {
    fake.myVaults.mockResolvedValue(list([]));
    renderWithProviders(page());
    const empty = await screen.findByTestId('me-empty');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(
      'This wallet has no vaults yet, as owner, guardian or heir.',
    );
    expect(within(empty).getByRole('link', { name: 'Rehearse one in about 6 minutes' })).toHaveAttribute(
      'href',
      '/create/#drill',
    );
    expect(screen.queryByTestId('me-section-own')).toBeNull();
    expect(screen.getByTestId('me-status')).toHaveTextContent('No vault names this wallet yet.');
    // The notes stand under every loaded state, the empty one included (R-T8-26).
    expect(screen.getByTestId('me-named')).toBeInTheDocument();
    expect(screen.queryByTestId('me-truncated')).toBeNull();
  });

  it('an empty read of a wallet listed more than 100 times says only what it read, and why a vault may be missing', async () => {
    // The spam case of R-T8-5: the wallet was named in 101 vaults that no longer name it (readVaultsOf drops a vault
    // whose roles are empty), so the newest 100 give nothing. "No vaults yet" would be false.
    fake.myVaults.mockResolvedValue(list([], { indexed: 101n }));
    renderWithProviders(page());
    const empty = await screen.findByTestId('me-empty');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(
      'No vault among the newest 100 entries names this wallet now.',
    );
    expect(screen.queryByText('This wallet has no vaults yet, as owner, guardian or heir.')).toBeNull();
    const note = screen.getByTestId('me-truncated');
    expect(note).toHaveTextContent('101');
    expect(note).toHaveTextContent('100');
    expect(screen.getByTestId('me-named')).toBeInTheDocument();
    expect(screen.getByTestId('me-status')).toHaveTextContent(
      'No vault among the newest 100 entries names this wallet now.',
    );
  });

  it('a first read that fails shows the error with Retry, and Retry reads again', async () => {
    fake.myVaults
      .mockRejectedValueOnce(new AtropyleError('RPC_UNAVAILABLE'))
      .mockResolvedValueOnce(list([mv(V1, ['owner'])]));
    renderWithProviders(page());
    const box = await screen.findByTestId('me-error');
    fireEvent.click(within(box).getByRole('button', { name: 'Retry' }));
    expect(await screen.findAllByTestId('me-row')).toHaveLength(1);
    expect(fake.myVaults).toHaveBeenCalledTimes(2);
  });

  it('a first read that fails waits for Retry: no poll, no read when the tab comes back, no loading ↔ error loop', async () => {
    // shouldAdvanceTime: findBy* polls with setTimeout, which the fake clock would otherwise hold still.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fake.myVaults.mockRejectedValue(new AtropyleError('RPC_UNAVAILABLE'));
    renderWithProviders(page());
    await screen.findByTestId('me-error');
    // Past one 60 s interval: a query that polled would have read again.
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fake.myVaults).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('me-error')).toBeInTheDocument();
    expect(screen.queryByTestId('me-loading')).toBeNull();
  });

  it('a refresh that fails keeps the vaults it had, with no error box', async () => {
    fake.myVaults
      .mockResolvedValueOnce(list([mv(V1, ['owner'])]))
      .mockRejectedValueOnce(new AtropyleError('RPC_UNAVAILABLE'));
    const { queryClient } = renderWithProviders(page());
    expect(await screen.findAllByTestId('me-row')).toHaveLength(1);
    await act(() => queryClient.refetchQueries({ queryKey: myVaultsKey(TEST_ACCOUNT) }));
    await vi.waitFor(() => expect(fake.myVaults).toHaveBeenCalledTimes(2));
    expect(screen.getAllByTestId('me-row')).toHaveLength(1);
    expect(screen.queryByTestId('me-error')).toBeNull();
    expect(screen.getByTestId('me-status')).toHaveTextContent('One vault names this wallet.');
  });

  it('never shows the previous wallet’s vaults under a new account', async () => {
    const other = PEOPLE.stranger as Address;
    fake.myVaults.mockImplementation(async (_sdk: unknown, account: string) =>
      account === TEST_ACCOUNT ? list([mv(V1, ['owner'])]) : new Promise<never>(() => undefined),
    );
    const base = walletValue();
    const wallet = base.wallet;
    if (!wallet) throw new Error('walletValue gives a wallet');
    const { rerender } = renderWithProviders(
      <WalletContext value={base}>
        <MePage />
      </WalletContext>,
    );
    expect(await screen.findAllByTestId('me-row')).toHaveLength(1);
    rerender(
      <WalletContext value={{ ...base, wallet: { ...wallet, account: other } }}>
        <MePage />
      </WalletContext>,
    );
    expect(screen.queryAllByTestId('me-row')).toHaveLength(0);
    expect(screen.getByTestId('me-loading')).toBeInTheDocument();
    expect(screen.getByTestId('me-cli')).toHaveTextContent(other);
  });

  it('says when the factory lists more entries than the page reads', async () => {
    fake.myVaults.mockResolvedValue(list([mv(V1, ['owner'])], { indexed: 101n }));
    const first = renderWithProviders(page());
    const note = await screen.findByTestId('me-truncated');
    expect(note).toHaveTextContent('101');
    expect(note).toHaveTextContent('100');
    first.unmount();
    fake.myVaults.mockResolvedValue(list([mv(V1, ['owner'])], { indexed: 100n }));
    renderWithProviders(page());
    await screen.findAllByTestId('me-row');
    expect(screen.queryByTestId('me-truncated')).toBeNull();
  });

  it('the overview counts each list and jumps to it', async () => {
    fake.myVaults.mockResolvedValue(list([mv(V1, ['owner']), mv(V2, ['heir', 'guardian']), mv(V3, ['heir'])]));
    renderWithProviders(page());
    const nav = await screen.findByRole('navigation', { name: 'Your vaults by role' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#me-own', '#me-guard', '#me-inherit']);
    expect(links.map((a) => a.textContent)).toEqual(['1You own', '1You guard', '2Name you as an heir']);
    for (const s of ['own', 'guard', 'inherit']) {
      expect(screen.getByTestId(`me-section-${s}`).id).toBe(`me-${s}`);
    }
  });

  it('has no overview while it reads, nor on the empty state', async () => {
    fake.myVaults.mockResolvedValue(list([]));
    renderWithProviders(page());
    await screen.findByTestId('me-empty');
    expect(screen.queryByTestId('me-overview')).toBeNull();
  });

  it('speaks Vietnamese', async () => {
    fake.myVaults.mockResolvedValue(list([mv(V1, ['owner'])]));
    renderWithProviders(page(), { lang: 'vi' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vault của tôi');
    expect(await screen.findByRole('heading', { level: 2, name: 'Vault bạn là chủ' })).toBeInTheDocument();
    expect(screen.getByTestId('me-status')).toHaveTextContent('Có một vault ghi ví này.');
    expect(
      within(screen.getAllByTestId('me-row')[0]).getByRole('link', { name: `Mở vault ${V1}` }),
    ).toBeInTheDocument();
  });
});
