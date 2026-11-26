import type { StateName } from '@atropyle/sdk';
import { fireEvent, screen } from '@testing-library/react';
import type { Address } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { GuestView } from '../../src/app/vault/guest';
import type { RegisteredVault, Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import { renderWithProviders } from '../helpers/render';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

const SDK = { atro: {}, deployment: { explorerUrl: null, factoryBlock: 0n } } as unknown as Sdk;

function loadedAt(state: StateName, pending: StateName): RegisteredVault {
  const base = fixtureSnapshot();
  const snap = { ...base, status: { ...base.status, state, pending } };
  return { snap, registered: true, timeline: fixtureTimeline(), fetchedAtMs: 0 };
}

function guest(account: Address | null, loaded: RegisteredVault, wallet: Partial<WalletValue> = {}) {
  const view = flows.vaultView(loaded.snap, loaded.timeline, account);
  const ui = <GuestView flows={flows} sdk={SDK} loaded={loaded} view={view} account={account} onChanged={() => {}} />;
  if (Object.keys(wallet).length === 0) return renderWithProviders(ui);
  // Only openSheet is read from the wallet here; the rest is never touched.
  return renderWithProviders(<WalletContext value={wallet as WalletValue}>{ui}</WalletContext>);
}

const LATE: [StateName, StateName, string][] = [
  ['active', 'grace', 'Raise the alarm'],
  ['grace', 'releasedInherit', 'Release to the heirs'],
];

describe('the guest view', () => {
  it.each(LATE)('never offers the owner a poke: signed by them it is a check-in (%s → %s)', (state, pending) => {
    guest(PEOPLE.owner, loadedAt(state, pending));
    expect(screen.getByTestId('vault-your-roles').textContent).toContain('Owner');
    expect(screen.queryByTestId('vault-no-role')).toBeNull();
    expect(screen.queryByTestId('vault-poke')).toBeNull();
    expect(screen.queryByTestId('vault-public-idle')).toBeNull();
    expect(screen.getByTestId('vault-public-owner').textContent).toContain('check-in');
  });

  it.each(LATE)('offers a stranger the poke, named by what it does (%s → %s)', (state, pending, label) => {
    guest(PEOPLE.stranger, loadedAt(state, pending));
    expect(screen.getByTestId('vault-no-role')).toBeTruthy();
    expect(screen.getByTestId('vault-poke').textContent).toContain(label);
    expect(screen.queryByTestId('vault-public-owner')).toBeNull();
  });

  it('helps with the poke by what it does: once the time to cancel is over, it never says the owner can cancel', () => {
    const help = () => screen.getByTestId('vault-poke-help').textContent ?? '';
    const cases: [StateName, StateName, RegExp, boolean][] = [
      ['active', 'grace', /raise the alarm/, true],
      ['grace', 'recovery', /starts the recovery/, true],
      ['recovery', 'active', /ends the alarm/, false],
      ['grace', 'releasedInherit', /passes the vault to the heirs/, false],
      ['recovery', 'releasedRecover', /passes the vault to the recovery wallet/, false],
    ];
    for (const [state, pending, says, cancel] of cases) {
      const r = guest(PEOPLE.stranger, loadedAt(state, pending));
      expect(help(), `${state} → ${pending}`).toMatch(says);
      expect(help().includes('can still cancel'), `${state} → ${pending}`).toBe(cancel);
      r.unmount();
    }
  });

  it('tells a stranger when nothing needs doing', () => {
    guest(PEOPLE.stranger, loadedAt('active', 'active'));
    expect(screen.queryByTestId('vault-poke')).toBeNull();
    expect(screen.getByTestId('vault-public-idle')).toBeTruthy();
  });

  it('offers delivery once released, and only while the owner holds something the vault can move', () => {
    const released = loadedAt('releasedInherit', 'releasedInherit');
    const r = guest(PEOPLE.stranger, released);
    expect(screen.getByTestId('vault-distribute').textContent).toContain('Deliver the assets');
    r.unmount();
    const status = released.snap.status;
    const emptied: RegisteredVault = {
      ...released,
      snap: { ...released.snap, status: { ...status, assets: status.assets.map((a) => ({ ...a, held: 0n })) } },
    };
    guest(PEOPLE.stranger, emptied);
    expect(screen.queryByTestId('vault-distribute')).toBeNull();
    expect(screen.getByTestId('vault-public-idle')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('You are watching this vault');
  });

  it('titles a stranger by what they can do, and says who may act once (review fix 3)', () => {
    const title = () => screen.getByRole('heading', { level: 2 }).textContent;
    const idle = guest(PEOPLE.stranger, loadedAt('active', 'active'));
    expect(title()).toBe('You are watching this vault');
    expect(screen.getByTestId('vault-no-role').textContent).toContain('the assets only ever go to the heirs');
    expect(screen.getByTestId('vault-public-idle').className).toContain('text-body');
    expect(screen.getByTestId('vault-public-idle').className).not.toContain('text-ink-muted');
    expect(screen.queryByText(/^Anyone can raise the alarm or deliver/)).toBeNull();
    idle.unmount();

    const late = guest(PEOPLE.stranger, loadedAt('active', 'grace'));
    expect(title()).toBe('Help this vault move on');
    expect(screen.getByText(/^If the owner has missed their check-ins/)).toBeTruthy();
    expect(screen.queryByText(/^Anyone can raise the alarm or deliver/)).toBeNull();
    late.unmount();

    guest(PEOPLE.stranger, loadedAt('releasedInherit', 'releasedInherit'));
    expect(title()).toBe('Help this vault move on');
  });

  it('tells a stranger the assets of a recovery go to the recovery wallet', () => {
    guest(PEOPLE.stranger, loadedAt('recovery', 'recovery'));
    expect(screen.getByTestId('vault-no-role').textContent).toContain('recovery wallet');
  });

  it('sends focus to its heading when the sheet closes on a connection', () => {
    const openSheet = vi.fn();
    guest(null, loadedAt('active', 'active'), { openSheet, wallet: null });
    fireEvent.click(screen.getByTestId('vault-guest-connect'));
    expect(openSheet).toHaveBeenCalledTimes(1);
    const fallback = openSheet.mock.calls[0][0] as () => HTMLElement | null;
    expect(fallback()?.id).toBe('vault-guest-title');
  });
});
