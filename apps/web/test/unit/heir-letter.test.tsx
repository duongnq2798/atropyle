import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Address } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { HeirLetter } from '../../src/app/vault/heir-letter';
import type { RegisteredVault, Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import { messages as heir } from '../../src/messages/heir.messages';
import { renderWithProviders } from '../helpers/render';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

vi.mock('../../src/app/vault/lazy-action-flow', () => ({
  actionFlowChunk: { preload: () => {}, peek: () => null, load: async () => ({}) },
  LazyActionFlow: (p: {
    testId: string;
    label: string;
    confirm?: string;
    hold?: { doneLabel?: string | null; showKnot?: boolean };
  }) => (
    <button
      type="button"
      data-testid={p.testId}
      data-confirm={p.confirm ?? 'click'}
      data-done-label={p.hold?.doneLabel ?? ''}
      data-knot={String(p.hold?.showKnot ?? true)}
    >
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

const SDK = {
  atro: {},
  deployment: { explorerUrl: 'https://www.oklink.com/xlayer', factoryBlock: 0n },
} as unknown as Sdk;

function loadedWith(status: Partial<RegisteredVault['snap']['status']> = {}): RegisteredVault {
  const base = fixtureSnapshot();
  return {
    snap: { ...base, status: { ...base.status, ...status } },
    registered: true,
    timeline: fixtureTimeline(),
    fetchedAtMs: 0,
  };
}

/** The panel's headings in document order start at h2 and never skip a level (axe heading-order is not in AXE_TAGS). */
function expectHeadingOrder(root: HTMLElement) {
  const levels = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1]));
  expect(levels[0]).toBe(2);
  for (let i = 1; i < levels.length; i++)
    expect(levels[i], `heading ${i}: ${levels.join(',')}`).toBeLessThanOrEqual(levels[i - 1] + 1);
}

function letter(account: Address, loaded = loadedWith(), lang: 'en' | 'vi' = 'en') {
  const view = flows.vaultView(loaded.snap, loaded.timeline, account);
  return renderWithProviders(
    <HeirLetter flows={flows} sdk={SDK} loaded={loaded} view={view} account={account} onChanged={() => {}} />,
    { lang },
  );
}

describe('the heir letter', () => {
  it('is always vellum, opens by the state, and signs with the last check-in', () => {
    letter(PEOPLE.heirA);
    expect(screen.getByTestId('heir-letter-sheet').getAttribute('data-theme')).toBe('light');
    expect(screen.getByTestId('heir-letter').getAttribute('data-opening')).toBe('openActive');
    expect(screen.getByTestId('heir-signed').getAttribute('data-ts')).toBe('990');
    expect(screen.getByRole('heading', { level: 2, name: 'What this vault leaves you' }).className).toContain(
      'voice-letter',
    );
  });

  it('highlights the connected reader branch on the thread (spec §18.3 row 11)', () => {
    letter(PEOPLE.heirA);
    const fig = () => screen.getByTestId('heir-thread');
    expect(fig().getAttribute('data-highlight')).toBe('0');
    expect(fig().getAttribute('data-thread-state')).toBe('releasedInherit');
    expect(fig().getAttribute('data-predicted')).toBe('true');
    cleanup();
    // Another case of the same address still finds the heir.
    letter(PEOPLE.heirB.toLowerCase() as Address);
    expect(fig().getAttribute('data-highlight')).toBe('1');
    cleanup();
    // The recovery wallet has no branch, even when it is also an heir.
    letter(
      PEOPLE.heirB,
      loadedWith({ state: 'recovery', pending: 'recovery', recoveryTarget: PEOPLE.heirB, windowEndsAt: 1200n }),
    );
    expect(screen.getByTestId('heir-letter').getAttribute('data-recover')).toBe('true');
    expect(fig().getAttribute('data-highlight')).toBe('');
    expect(screen.queryByTestId('heir-legend')).toBeNull();
  });

  it('writes the legend as a list: "You · 70% · about 0.35 USDT0", one line per branch', () => {
    letter(PEOPLE.heirA);
    const you = screen.getByTestId('heir-legend-0');
    expect(you.getAttribute('data-you')).toBe('true');
    expect(you.textContent).toMatch(/^You·70%·about\s*0\.35/);
    expect(you.textContent).toContain('USDT0');
    expect(screen.getByTestId('heir-legend-1').textContent).toMatch(/^Heir 2·30%·about\s*0\.15/);
  });

  it('shows no legend while a recovery turns the course away from the heirs', () => {
    letter(PEOPLE.heirA, loadedWith({ state: 'recovery', pending: 'recovery', recoveryTarget: PEOPLE.stranger }));
    expect(screen.getByTestId('heir-thread').getAttribute('data-thread-state')).toBe('recovery');
    expect(screen.queryByTestId('heir-legend')).toBeNull();
  });

  it('writes the body and the Drill note in the Letter voice', () => {
    letter(PEOPLE.heirA);
    expect(screen.getByTestId('heir-body').className).toContain('voice-letter');
    expect(screen.getByTestId('heir-opening').textContent).toMatch(
      /^Nothing has happened\. This is what was set aside for you\./,
    );
  });

  it('says "They have been silent since" in grace, dated by the last check-in', () => {
    letter(PEOPLE.heirA, loadedWith({ state: 'grace', pending: 'grace', alarmAt: 1060n }));
    expect(screen.getByTestId('heir-opening').textContent).toMatch(/^They have been silent since .*1970/);
  });

  it('keeps the heading levels in order: no skipped level, one alerts heading', () => {
    const { container } = letter(
      PEOPLE.heirA,
      loadedWith({ state: 'releasedInherit', pending: 'releasedInherit', releasedAt: 1230n }),
    );
    expectHeadingOrder(container);
    expect(screen.getAllByRole('heading', { level: 3, name: 'Email alerts' })).toHaveLength(1);
  });

  it('draws the reader branch on the thread and marks their share', () => {
    letter(PEOPLE.heirB);
    const mine = screen.getAllByTestId(/^heir-share-\d$/).filter((r) => r.getAttribute('data-you') === 'true');
    expect(mine.length).toBeGreaterThan(0);
    // Coverage 500000 of 1000000: the rest stays with the owner, and the letter says so.
    expect(screen.getAllByTestId(/^heir-share-\d-uncovered$/).length).toBeGreaterThan(0);
  });

  it('offers no poke and nothing to receive while the owner is on time', () => {
    letter(PEOPLE.heirA);
    expect(screen.getByTestId('heir-move-idle')).toBeTruthy();
    expect(screen.getByTestId('heir-receive-idle')).toBeTruthy();
  });

  it('offers the poke that serves the heir, named by what it does', () => {
    letter(PEOPLE.heirA, loadedWith({ state: 'grace', pending: 'releasedInherit' }));
    expect(screen.getByTestId('heir-poke').textContent).toBe('Release to the heirs');
    expect(screen.getByTestId('heir-letter').getAttribute('data-opening')).toBe('openDue');
  });

  it('never offers the heir the poke that ends an alarm', () => {
    letter(PEOPLE.heirA, loadedWith({ state: 'recovery', pending: 'active' }));
    expect(screen.queryByTestId('heir-poke')).toBeNull();
  });

  it('once released, Receive is a hold that says "Now confirm in your wallet" and ties no knot', () => {
    letter(PEOPLE.heirA, loadedWith({ state: 'releasedInherit', pending: 'releasedInherit', releasedAt: 1230n }));
    const receive = screen.getByTestId('heir-receive');
    expect(receive.getAttribute('data-confirm')).toBe('hold');
    expect(receive.getAttribute('data-done-label')).toBe('Now confirm in your wallet');
    expect(receive.getAttribute('data-knot')).toBe('false');
  });

  it('the recovery wallet reads its own letter: no branch, its own opening', () => {
    letter(
      PEOPLE.stranger,
      loadedWith({ state: 'recovery', pending: 'recovery', recoveryTarget: PEOPLE.stranger, windowEndsAt: 1200n }),
    );
    expect(screen.getByTestId('heir-letter').getAttribute('data-recover')).toBe('true');
    expect(screen.getByTestId('heir-letter').getAttribute('data-opening')).toBe('openRecoverPending');
    expect(screen.getByRole('heading', { level: 2, name: 'A recovery names this wallet' })).toBeTruthy();
  });

  it('explains its words in popovers', () => {
    letter(PEOPLE.heirA);
    fireEvent.click(screen.getByTestId('heir-term-checkIn'));
    expect(screen.getByTestId('heir-term-checkIn-def').textContent).toContain('still here');
  });

  it('links step 1 to /verify/ for this vault', () => {
    letter(PEOPLE.heirA);
    expect(screen.getByTestId('heir-verify').getAttribute('href')).toBe(`/verify/#${PEOPLE.vault}`);
  });

  it('reads in Vietnamese with "điểm danh"', () => {
    letter(PEOPLE.heirA, loadedWith(), 'vi');
    expect(screen.getByTestId('heir-opening').textContent).toContain('điểm danh');
  });

  it('never tells an heir to claim or unlock', () => {
    const words = Object.values(heir.en).join(' ');
    expect(words).not.toMatch(/\bclaim|\bunlock|dead man/i);
  });
});
