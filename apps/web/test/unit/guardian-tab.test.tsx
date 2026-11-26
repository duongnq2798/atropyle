import { fireEvent, screen } from '@testing-library/react';
import type { Address } from 'viem';
import { getAddress } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuardianTab } from '../../src/app/vault/guardian-tab';
import type { RegisteredVault, Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import { renderWithProviders } from '../helpers/render';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

const frame = vi.hoisted(() => ({ framed: false }));
vi.mock('../../src/lib/framed', () => ({ isFramed: () => frame.framed }));
// The signing UI is not under test: a button that says what it would prepare.
vi.mock('../../src/app/vault/lazy-action-flow', () => ({
  actionFlowChunk: { preload: () => {}, peek: () => null, load: async () => ({}) },
  LazyActionFlow: (p: { testId: string; label: string; action: unknown }) => (
    <button type="button" data-testid={p.testId} data-action={JSON.stringify(p.action)}>
      {p.label}
    </button>
  ),
}));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: () => ({ deployment: fixtureDeployment(), atro: {}, rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});
vi.mock('next/navigation', () => ({ usePathname: () => '/vault/', useRouter: () => ({ push: vi.fn() }) }));

const SDK = { atro: {}, deployment: { explorerUrl: null, factoryBlock: 0n } } as unknown as Sdk;
const TARGET = getAddress('0x976EA74026E726554dB657fA54763abd0C3a0aa9');

function loadedWith(status: Partial<RegisteredVault['snap']['status']> = {}): RegisteredVault {
  const base = fixtureSnapshot();
  return {
    snap: { ...base, status: { ...base.status, ...status } },
    registered: true,
    timeline: fixtureTimeline(),
    fetchedAtMs: 0,
  };
}

function tab(account: Address, loaded = loadedWith(), lang: 'en' | 'vi' = 'en') {
  const view = flows.vaultView(loaded.snap, loaded.timeline, account);
  return renderWithProviders(
    <GuardianTab flows={flows} sdk={SDK} loaded={loaded} view={view} account={account} onChanged={() => {}} />,
    { lang },
  );
}

const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });

beforeEach(() => {
  frame.framed = false;
});

describe('the guardian tab', () => {
  it('lists the guardians, marks the reader, and says the warning before any action', () => {
    tab(PEOPLE.g1);
    expect(screen.getByTestId('guardian-warning').textContent).toContain('channel you already trust');
    const me = screen.getAllByTestId(/^guardian-row-\d$/).filter((r) => r.getAttribute('data-me') === 'true');
    expect(me).toHaveLength(1);
    expect(screen.getByTestId('guardian-attest-count').getAttribute('data-count')).toBe('0');
    expect(screen.getByTestId('guardian-attest').getAttribute('data-action')).toBe('{"type":"attestDeath","on":true}');
  });

  it('keeps the vote closed until the new wallet is typed twice, the same, with a valid checksum', () => {
    tab(PEOPLE.g1);
    const vote = () => screen.getByTestId('guardian-vote');
    expect((vote() as HTMLButtonElement).disabled).toBe(true);
    type('guardian-target-1', TARGET);
    expect((vote() as HTMLButtonElement).disabled).toBe(true);
    // Still typing: no error yet.
    type('guardian-target-2', TARGET.slice(0, 20));
    expect(screen.queryByTestId('guardian-target-error')).toBeNull();
    fireEvent.blur(screen.getByTestId('guardian-target-2'));
    expect(screen.getByTestId('guardian-target-error').getAttribute('data-reason')).toBe('invalid');
    // A wrong letter case breaks the checksum.
    const flipped = TARGET.replace(/[a-f]/, (c) => c.toUpperCase());
    type('guardian-target-2', flipped);
    expect(screen.getByTestId('guardian-target-error').getAttribute('data-reason')).toBe('invalid');
    type('guardian-target-2', getAddress(PEOPLE.stranger));
    expect(screen.getByTestId('guardian-target-error').getAttribute('data-reason')).toBe('mismatch');
    expect(screen.getByTestId('guardian-target-live').textContent).toContain('differ');
    type('guardian-target-2', TARGET.toLowerCase());
    expect(screen.queryByTestId('guardian-target-error')).toBeNull();
    expect(screen.getByTestId('guardian-target-confirmed').getAttribute('data-target')).toBe(TARGET);
    expect(JSON.parse(vote().getAttribute('data-action') ?? '{}')).toEqual({ type: 'voteRecovery', target: TARGET });
  });

  it('speaks once both fields are full, without waiting for a blur', () => {
    tab(PEOPLE.g1);
    type('guardian-target-1', TARGET);
    type('guardian-target-2', getAddress(PEOPLE.stranger));
    expect(screen.getByTestId('guardian-target-error').getAttribute('data-reason')).toBe('mismatch');
  });

  it('never reads the new wallet from the URL', () => {
    window.history.replaceState(null, '', `/vault/?target=${TARGET}#${PEOPLE.vault}`);
    tab(PEOPLE.g1);
    expect((screen.getByTestId('guardian-target-1') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('guardian-target-2') as HTMLInputElement).value).toBe('');
    window.history.replaceState(null, '', '/');
  });

  it('offers to withdraw a vote already cast', () => {
    const base = fixtureSnapshot();
    tab(
      PEOPLE.g1,
      loadedWith({
        recVotes: base.config.guardians.map((g) => ({ guardian: g, target: g === PEOPLE.g1 ? TARGET : null })),
      }),
    );
    expect(screen.getByTestId('guardian-my-vote').textContent).toContain('Your vote');
    expect(screen.getByTestId('guardian-withdraw').getAttribute('data-action')).toBe(
      '{"type":"voteRecovery","target":null}',
    );
    expect(screen.getByTestId('guardian-tally-0').getAttribute('data-votes')).toBe('1');
  });

  it('inside a frame, offers no attest and no vote', () => {
    frame.framed = true;
    tab(PEOPLE.g1);
    expect(screen.getByTestId('guardian-framed')).toBeTruthy();
    expect(screen.queryByTestId('guardian-attest')).toBeNull();
    expect(screen.queryByTestId('guardian-vote-card')).toBeNull();
  });

  it('once the vault has passed on, says there is nothing left to do', () => {
    tab(PEOPLE.g1, loadedWith({ state: 'releasedInherit', pending: 'releasedInherit' }));
    expect(screen.getByTestId('guardian-closed')).toBeTruthy();
    expect(screen.queryByTestId('guardian-warning')).toBeNull();
    expect(screen.queryByTestId('guardian-attest')).toBeNull();
  });

  it('says the warning in Vietnamese', () => {
    tab(PEOPLE.g1, loadedWith(), 'vi');
    expect(screen.getByTestId('guardian-warning').textContent).toContain('kênh bạn vốn đã tin');
  });

  it('keeps the heading levels in order: no skipped level, one alerts heading', () => {
    const { container } = tab(PEOPLE.g1);
    const levels = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(2);
    for (let i = 1; i < levels.length; i++)
      expect(levels[i], `heading ${i}: ${levels.join(',')}`).toBeLessThanOrEqual(levels[i - 1] + 1);
    expect(levels).toContain(4);
    expect(screen.getAllByRole('heading', { level: 3, name: 'Email alerts' })).toHaveLength(1);
  });
});
