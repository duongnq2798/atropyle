import { AtropyleError, type VaultSnapshot } from '@atropyle/sdk';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseInvite } from '../../src/app/join/invite';
import { JoinPage, joinView } from '../../src/app/join/join-page';
import { remainingAt } from '../../src/app/join/remaining';
import type { InvitedVault } from '../../src/app/join/use-invited-vault';
import { threadRemaining } from '../../src/thread/state';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import { renderWithProviders } from '../helpers/render';
import { walletValue } from '../helpers/wallet';
import { fixtureSnapshot, PEOPLE } from './fixtures';

const fake = vi.hoisted(() => ({ vault: vi.fn() }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: () => ({ atro: { vault: fake.vault }, deployment: fixtureDeployment(), rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});
// ErrorBox words an error through the tx chunk; here it loads at once (proof-view.test.tsx).
vi.mock('../../src/tx/load', async () => {
  const impl = await import('../../src/tx/impl');
  return { loadTxImpl: async () => impl, peekTxImpl: () => null };
});
vi.mock('next/navigation', () => ({
  usePathname: () => '/join/',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));
// The real form reads the deployment through useSdk; the page only has to hand it the vault and the role.
vi.mock('../../src/components/subscribe/SubscribeForm', () => ({
  SubscribeForm: ({ vault, role, compact }: { vault: string; role: string; compact?: boolean }) => (
    <div data-testid="subscribe-stub" data-vault={vault} data-role={role} data-compact={String(!!compact)} />
  ),
}));

/** A vault handle that answers with `snap` (the guarded fixture by default) and was made by the factory. */
function handle(o: { snap?: () => Promise<VaultSnapshot>; registered?: () => Promise<boolean> } = {}) {
  return {
    address: PEOPLE.vault,
    snapshot: o.snap ?? (async () => fixtureSnapshot()),
    registered: o.registered ?? (async () => true),
  };
}

function edit(over: (s: VaultSnapshot) => void): () => Promise<VaultSnapshot> {
  return async () => {
    const s = fixtureSnapshot();
    over(s);
    return s;
  };
}

const idle = { status: 'idle', wallet: null } as const;
const open = (hash: string) => window.history.replaceState(null, '', `/join/${hash}`);
const page = (over: Partial<WalletValue> = idle) => (
  <WalletContext value={walletValue(over)}>
    <JoinPage />
  </WalletContext>
);
const asWallet = (account: string): Partial<WalletValue> => {
  const base = walletValue();
  return { wallet: base.wallet ? { ...base.wallet, account: account as `0x${string}` } : null };
};
const root = () => screen.getByTestId('join');
async function ready() {
  await waitFor(() => expect(root()).toHaveAttribute('data-state', 'ready'));
}

beforeEach(() => {
  fake.vault.mockReset();
  fake.vault.mockImplementation(() => handle());
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('the view of an invitation', () => {
  const ok = parseInvite(`#${PEOPLE.vault}.heir`);
  const data: InvitedVault = { address: PEOPLE.vault, snap: fixtureSnapshot(), registered: true };
  const none = { isError: false, error: null };

  it('shows nothing the link claims before the chain has confirmed the vault', () => {
    expect(joinView(false, ok, none)).toEqual({ kind: 'loading' });
    expect(joinView(true, parseInvite('#x'), none)).toEqual({ kind: 'invalid', reason: 'shape' });
    expect(joinView(true, ok, none)).toEqual({ kind: 'loading' });
    expect(joinView(true, ok, { isError: true, error: new AtropyleError('INVALID_ADDRESS') })).toEqual({
      kind: 'invalid',
      reason: 'address',
    });
    expect(joinView(true, ok, { isError: true, error: new AtropyleError('NOT_VAULT') })).toEqual({ kind: 'notVault' });
    expect(joinView(true, ok, { data: { ...data, registered: false }, ...none })).toEqual({ kind: 'notVault' });
    const down = new AtropyleError('RPC_UNAVAILABLE');
    expect(joinView(true, ok, { isError: true, error: down })).toEqual({ kind: 'error', error: down });
    // A refresh that fails later keeps what the chain already said.
    expect(joinView(true, ok, { data, isError: true, error: down })).toEqual({
      kind: 'ready',
      vault: data,
      role: 'heir',
    });
  });
});

describe('/join/ for an heir', () => {
  it('reads the vault named by the link, once, and then says what being an heir means', async () => {
    open(`#${PEOPLE.vault}.heir`);
    renderWithProviders(page());
    await ready();
    expect(fake.vault).toHaveBeenCalledTimes(1);
    expect(fake.vault).toHaveBeenCalledWith(PEOPLE.vault);
    expect(screen.getByRole('heading', { level: 1, name: 'You have been named as an heir' })).toBeInTheDocument();
    const card = screen.getByTestId('join-vault');
    expect(card.querySelector(`[data-address="${PEOPLE.vault}"]`)).not.toBeNull();
    expect(card.querySelector(`[data-address="${PEOPLE.owner}"]`)).not.toBeNull();
    expect(within(card).getByText('Heirs').nextElementSibling).toHaveTextContent('2');
    expect(within(card).getByText('Guardians').nextElementSibling).toHaveTextContent('3, and 2 of them must agree');
    const steps = within(screen.getByRole('region', { name: 'What this means for you' })).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('You do not need to do anything now');
    const safety = within(screen.getByRole('region', { name: 'Stay safe' })).getAllByRole('listitem');
    expect(safety.map((li) => li.textContent)).toEqual([
      'Atropyle never asks for your secret phrase or private key, and never contacts you first.',
      'This page asks you to sign nothing.',
      'Check that the vault address above is the one the owner told you about.',
    ]);
    const form = screen.getByTestId('subscribe-stub');
    expect(form).toHaveAttribute('data-vault', PEOPLE.vault);
    expect(form).toHaveAttribute('data-role', 'heir');
    expect(form).toHaveAttribute('data-compact', 'true');
    expect(screen.getByRole('link', { name: 'See the whole vault' })).toHaveAttribute(
      'href',
      `/vault/#${PEOPLE.vault}`,
    );
    expect(screen.getByRole('link', { name: 'See the proof' })).toHaveAttribute('href', '/proof/');
  });

  it('refuses a link with another role and reads nothing', async () => {
    open(`#${PEOPLE.vault}.owner`);
    renderWithProviders(page());
    await waitFor(() => expect(root()).toHaveAttribute('data-state', 'invalid'));
    expect(root()).toHaveAttribute('data-reason', 'role');
    expect(fake.vault).not.toHaveBeenCalled();
    expect(screen.queryByTestId('subscribe-stub')).toBeNull();
  });

  it('calls a changed checksum a broken link, as the SDK refuses it', async () => {
    fake.vault.mockImplementation(() => {
      throw new AtropyleError('INVALID_ADDRESS', { message: 'bad checksum' });
    });
    open(`#${PEOPLE.vault}.heir`);
    renderWithProviders(page());
    await waitFor(() => expect(root()).toHaveAttribute('data-state', 'invalid'));
    expect(root()).toHaveAttribute('data-reason', 'address');
    expect(screen.getByText(/The vault address in the link is not valid/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
    expect(screen.queryByTestId('subscribe-stub')).toBeNull();
    // An edited link is what a scam looks like: the safety rules stay, without the address line it cannot show.
    const safety = within(screen.getByRole('region', { name: 'Stay safe' })).getAllByRole('listitem');
    expect(safety.map((li) => li.textContent)).toEqual([
      'Atropyle never asks for your secret phrase or private key, and never contacts you first.',
      'This page asks you to sign nothing.',
    ]);
  });

  it('says there is no vault for an address that is not one, or that the factory did not make', async () => {
    fake.vault.mockImplementation(() => handle({ snap: async () => Promise.reject(new AtropyleError('NOT_VAULT')) }));
    open(`#${PEOPLE.vault}.heir`);
    const first = renderWithProviders(page());
    await waitFor(() => expect(root()).toHaveAttribute('data-state', 'notVault'));
    expect(screen.queryByTestId('subscribe-stub')).toBeNull();
    first.unmount();

    fake.vault.mockImplementation(() => handle({ registered: async () => false }));
    renderWithProviders(page());
    await waitFor(() => expect(root()).toHaveAttribute('data-state', 'notVault'));
    expect(screen.getByRole('heading', { level: 1, name: 'There is no Atropyle vault at this address' })).toBeVisible();
    expect(screen.queryByTestId('subscribe-stub')).toBeNull();
  });

  it('shows a failed first read with Retry, and Retry reads the vault', async () => {
    fake.vault.mockImplementation(() =>
      handle({ snap: async () => Promise.reject(new AtropyleError('RPC_UNAVAILABLE')) }),
    );
    open(`#${PEOPLE.vault}.heir`);
    renderWithProviders(page());
    await waitFor(() => expect(root()).toHaveAttribute('data-state', 'error'));
    const box = screen.getByTestId('join-error');
    fake.vault.mockImplementation(() => handle());
    fireEvent.click(within(box).getByRole('button', { name: 'Retry' }));
    await ready();
    expect(screen.queryByTestId('join-error')).toBeNull();
  });
});

describe('the wallet check', () => {
  it('recognises the heir the owner named, with their share', async () => {
    open(`#${PEOPLE.vault}.heir`);
    renderWithProviders(page(asWallet(PEOPLE.heirA)));
    await ready();
    const line = screen.getByTestId('join-wallet');
    expect(line).toHaveAttribute('data-named', 'yes');
    expect(line).toHaveTextContent('The connected wallet is named as an heir in this vault.');
    expect(line).toHaveTextContent('Your share in the plan: 70%.');
    expect(screen.getByTestId('join-vault').querySelector('[data-thread]')).toHaveAttribute('data-highlight', '0');
  });

  it('tells a wallet with no role, and a wallet with another role, what it is', async () => {
    open(`#${PEOPLE.vault}.heir`);
    const stranger = renderWithProviders(page(asWallet(PEOPLE.stranger)));
    await ready();
    expect(screen.getByTestId('join-wallet')).toHaveAttribute('data-named', 'no');
    stranger.unmount();

    renderWithProviders(page(asWallet(PEOPLE.owner)));
    await ready();
    const line = screen.getByTestId('join-wallet');
    expect(line).toHaveAttribute('data-named', 'other');
    expect(line).toHaveTextContent('Owner');
  });

  it('offers to connect without a wallet, and the sheet gives focus back to the title', async () => {
    const openSheet = vi.fn();
    open(`#${PEOPLE.vault}.heir`);
    renderWithProviders(page({ ...idle, openSheet }));
    await ready();
    expect(screen.getByTestId('join-wallet')).toHaveAttribute('data-named', 'none');
    fireEvent.click(screen.getByTestId('join-connect'));
    expect(openSheet).toHaveBeenCalledTimes(1);
    const fallback = openSheet.mock.calls[0][0] as () => HTMLElement | null;
    expect(fallback()).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('says the wallet is reconnecting rather than offering Connect', async () => {
    open(`#${PEOPLE.vault}.heir`);
    renderWithProviders(page({ status: 'restoring', wallet: null }));
    await ready();
    expect(screen.getByTestId('join-wallet')).toHaveAttribute('data-named', 'restoring');
    expect(screen.queryByTestId('join-connect')).toBeNull();
  });
});

describe('/join/ for a guardian', () => {
  it('names k and n from the vault, and the power of recovery when it is on', async () => {
    open(`#${PEOPLE.vault}.guardian`);
    renderWithProviders(page());
    await ready();
    expect(screen.getByRole('heading', { level: 1, name: 'You have been asked to be a guardian' })).toBeVisible();
    const steps = within(screen.getByRole('region', { name: 'What this means for you' })).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('When 2 of the 3 guardians confirm');
    expect(steps[1]).toHaveTextContent('2 guardians who agree can move everything in the vault');
  });

  it('says recovery is off when it is', async () => {
    fake.vault.mockImplementation(() =>
      handle({
        snap: edit((s) => {
          s.config.recoveryEnabled = false;
        }),
      }),
    );
    open(`#${PEOPLE.vault}.guardian`);
    renderWithProviders(page());
    await ready();
    expect(screen.getByText('Recovery is off in this vault: guardians cannot move its assets anywhere.')).toBeVisible();
  });

  it('says a vault with no guardians gives a guardian nothing to do', async () => {
    fake.vault.mockImplementation(() =>
      handle({
        snap: edit((s) => {
          s.config.guardians = [];
          s.config.k = 0;
        }),
      }),
    );
    open(`#${PEOPLE.vault}.guardian`);
    renderWithProviders(page());
    await ready();
    const steps = within(screen.getByRole('region', { name: 'What this means for you' })).getAllByRole('listitem');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toHaveTextContent('This vault names no guardians yet');
    expect(within(screen.getByTestId('join-vault')).getByText('Guardians').nextElementSibling).toHaveTextContent(
      'None',
    );
  });
});

describe('what the vault is doing now', () => {
  it('names an alarm, a release to the heirs and the end of a Drill', async () => {
    fake.vault.mockImplementation(() =>
      handle({
        snap: edit((s) => {
          s.status.state = 'grace';
        }),
      }),
    );
    open(`#${PEOPLE.vault}.heir`);
    const grace = renderWithProviders(page());
    await ready();
    expect(screen.getByText(/Right now the alarm is on/)).toBeVisible();
    grace.unmount();

    fake.vault.mockImplementation(() =>
      handle({
        snap: edit((s) => {
          s.status.state = 'releasedInherit';
        }),
      }),
    );
    const released = renderWithProviders(page());
    await ready();
    expect(screen.getByText(/The waiting time is over/)).toBeVisible();
    released.unmount();

    fake.vault.mockImplementation(() =>
      handle({
        snap: edit((s) => {
          s.status.expired = true;
        }),
      }),
    );
    renderWithProviders(page());
    await ready();
    expect(screen.getByText(/This Drill has ended/)).toBeVisible();
  });
});

describe('the thread of the vault card', () => {
  it('reads the share of the thread left exactly as threadRemaining does (a local copy, R-T9-23)', () => {
    const base = fixtureSnapshot().status;
    const cases = [
      base,
      { ...base, state: 'grace' as const, alarmAt: 1_050n, windowEndsAt: 1_250n, blockTimestamp: 1_100n },
      { ...base, state: 'releasedInherit' as const },
      { ...base, state: 'releasedRecover' as const },
      { ...base, expired: true },
    ];
    for (const s of cases)
      for (const now of [s.blockTimestamp, s.blockTimestamp + 75n, s.blockTimestamp + 10_000n])
        expect(remainingAt(s, now), `${s.state}${s.expired ? ' expired' : ''} at ${now}`).toBe(threadRemaining(s, now));
    // Not a vacuous check: the active fixture has some thread left, the grace one a part of its window.
    expect(remainingAt(base, base.blockTimestamp)).toBeGreaterThan(0);
    expect(remainingAt(cases[1], 1_100n)).toBe(0.75);
  });
});
