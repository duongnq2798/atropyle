import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Address } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeirLetter } from '../../src/app/vault/heir-letter';
import { keepDate } from '../../src/app/vault/standing';
import type { RegisteredVault, Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import type { FlowsImpl } from '../../src/flows/load';
import { chainDate } from '../../src/lib/when';
import { messages as heir } from '../../src/messages/heir.messages';
import { renderWithProviders } from '../helpers/render';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

/** What a press on the mocked flow sends: the test sets it, the button hands it to onDone. */
const sending = vi.hoisted(() => ({ result: null as unknown }));
vi.mock('../../src/app/vault/lazy-action-flow', () => ({
  actionFlowChunk: { preload: () => {}, peek: () => null, load: async () => ({}) },
  LazyActionFlow: (p: {
    testId: string;
    label: string;
    confirm?: string;
    resettable?: boolean;
    hold?: { doneLabel?: string | null; showKnot?: boolean };
    onDone?(r: unknown): void;
  }) => (
    <button
      type="button"
      data-testid={p.testId}
      data-confirm={p.confirm ?? 'click'}
      data-done-label={p.hold?.doneLabel ?? ''}
      data-knot={String(p.hold?.showKnot ?? true)}
      data-resettable={String(p.resettable ?? true)}
      onClick={() => (sending.result ? p.onDone?.(sending.result) : undefined)}
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

function letter(account: Address, loaded = loadedWith(), lang: 'en' | 'vi' = 'en', impl: FlowsImpl = flows) {
  const view = impl.vaultView(loaded.snap, loaded.timeline, account);
  return renderWithProviders(
    <HeirLetter flows={impl} sdk={SDK} loaded={loaded} view={view} account={account} onChanged={() => {}} />,
    { lang },
  );
}

// Each moment on its own day: a date taken from the wrong field cannot pass.
const DAY = 86_400n;
const T = {
  lastAlive: DAY * 400n + 3_600n,
  alarmAt: DAY * 403n + 3_600n,
  releasedAt: DAY * 407n + 3_600n,
  blockTimestamp: DAY * 409n + 3_600n,
};
const date = (ts: bigint) => keepDate(chainDate(ts, 'en', true));

/** The vault released, the owner's wallet emptied by a distribute: nothing is left to deliver. */
function emptied(): RegisteredVault {
  const base = loadedWith({ state: 'releasedInherit', pending: 'releasedInherit', ...T });
  const status = base.snap.status;
  const assets = status.assets.map((a) => ({ ...a, held: 0n, coverage: 0n }));
  return { ...base, snap: { ...base.snap, status: { ...status, assets } } };
}

const HASH = `0x${'ab'.repeat(32)}` as const;
/** A Distributed event of the vault, as the SDK decodes it. */
const distributed = (to: Address, amount: bigint, logIndex = 1) => ({
  name: 'Distributed',
  args: { assetIndex: 0n, to, amountOrId: amount },
  transactionHash: HASH,
  logIndex,
  blockNumber: 101n,
});

beforeEach(() => {
  sending.result = null;
});

describe('the heir letter', () => {
  it('is always vellum, opens by the state, and signs with the last check-in', () => {
    letter(PEOPLE.heirA);
    expect(screen.getByTestId('heir-letter-sheet').getAttribute('data-theme')).toBe('light');
    expect(screen.getByTestId('heir-letter').getAttribute('data-opening')).toBe('openActive');
    expect(screen.getByTestId('heir-signed').getAttribute('data-ts')).toBe('990');
    cleanup();
    // The words themselves carry the last check-in, not the block's time nor the release.
    letter(PEOPLE.heirA, loadedWith({ state: 'releasedInherit', pending: 'releasedInherit', ...T }));
    const signed = screen.getByTestId('heir-signed').textContent ?? '';
    const plain = (ts: bigint) => chainDate(ts, 'en', true);
    expect(signed).toContain(plain(T.lastAlive));
    expect(signed).not.toContain(plain(T.blockTimestamp));
    expect(signed).not.toContain(plain(T.releasedAt));
    expect(screen.getByRole('heading', { level: 2, name: 'What this vault leaves you' }).className).toContain(
      'voice-letter',
    );
  });

  it.each(['en', 'vi'] as const)(
    'signs on two lines in %s: the words, then the date and time as one unit that never breaks',
    (lang) => {
      letter(PEOPLE.heirA, loadedWith({ ...T }), lang);
      const signed = screen.getByTestId('heir-signed');
      const words = signed.querySelector('[data-testid="heir-signed-words"]');
      expect(words?.className).toContain('voice-letter');
      // The Letter line holds no date: a date at lead size breaks before its time and leaves "23:35 UTC" alone.
      expect(words?.textContent).toBe(heir[lang].signed);
      expect(words?.textContent).not.toMatch(/\d/);
      const time = signed.querySelector('time');
      expect(time?.getAttribute('dateTime')).toBe(new Date(Number(T.lastAlive) * 1000).toISOString());
      expect(time?.textContent).toBe(chainDate(T.lastAlive, lang, true));
      expect(time?.className).toContain('whitespace-nowrap');
      expect(time?.className).toContain('voice-ledger');
    },
  );

  it('balances the opening, so no line of it holds a lone word or a split verb', () => {
    letter(PEOPLE.heirA);
    expect(screen.getByTestId('heir-opening').className).toContain('[text-wrap:balance]');
    // Balance alone split "ngăn / lại" across two lines at 390 px: the VI openings keep the verb whole.
    const NBSP = String.fromCharCode(0xa0);
    for (const key of ['openRecovery', 'openRecoverPending'] as const) {
      expect(heir.vi[key]).toContain(`ngăn${NBSP}lại`);
      expect(heir.vi[key]).not.toContain('ngăn lại');
    }
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
    letter(PEOPLE.heirA, loadedWith({ state: 'grace', pending: 'grace', ...T }));
    const opening = screen.getByTestId('heir-opening').textContent ?? '';
    expect(opening).toMatch(/^They have been silent since /);
    expect(opening).toContain(date(T.lastAlive));
    expect(opening).not.toContain(date(T.alarmAt));
  });

  it('once the reader received, says so, lists what they received, and offers no fresh start', () => {
    letter(PEOPLE.heirA, loadedWith({ state: 'releasedInherit', pending: 'releasedInherit', ...T }));
    expect(screen.getByRole('heading', { level: 3, name: 'Receive' })).toBeTruthy();
    expect(screen.getByTestId('heir-receive-help')).toBeTruthy();
    expect(screen.getByTestId('heir-receive').getAttribute('data-resettable')).toBe('true');
    sending.result = {
      steps: [
        { blockNumber: 101n, events: [distributed(PEOPLE.heirA, 350_000n), distributed(PEOPLE.heirB, 150_000n, 2)] },
      ],
    };
    fireEvent.click(screen.getByTestId('heir-receive'));
    expect(screen.getByTestId('heir-letter').getAttribute('data-opening')).toBe('openDelivered');
    expect(screen.getByTestId('heir-opening').textContent).toBe(
      `On ${date(T.releasedAt)} the vault passed to the heirs, and your share has reached your wallet.`,
    );
    // What the reader received, theirs only, in place of who would receive what.
    expect(screen.getByRole('heading', { level: 3, name: 'What you received' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Who receives what' })).toBeNull();
    const rows = screen.getAllByTestId(/^heir-got-\d$/);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/0\.35\s*USDT0/);
    // Step 3 is done: its heading says so, the help that came before is gone, and nothing invites a second send.
    expect(screen.getByRole('heading', { level: 3, name: 'Received' })).toBeTruthy();
    expect(screen.getByTestId('heir-step-3').getAttribute('data-done')).toBe('true');
    expect(screen.queryByTestId('heir-receive-help')).toBeNull();
    expect(screen.getByTestId('heir-receive').getAttribute('data-resettable')).toBe('false');
  });

  it('after a reload, finds what reached the reader in the vault events', async () => {
    const deliveriesTo = vi.fn(async () => flows.transferRows([distributed(PEOPLE.heirA, 350_000n)] as never));
    letter(PEOPLE.heirA, emptied(), 'en', { ...flows, deliveriesTo });
    expect(await screen.findByTestId('heir-got-0')).toBeTruthy();
    expect(deliveriesTo).toHaveBeenCalledWith(SDK.atro, PEOPLE.vault, PEOPLE.heirA, 100n, 0n);
    expect(screen.getByTestId('heir-letter').getAttribute('data-opening')).toBe('openDelivered');
    expect(screen.getByRole('heading', { level: 3, name: 'Received' })).toBeTruthy();
    expect(screen.getByTestId('heir-receive-done')).toBeTruthy();
  });

  it('released with nothing left and nothing found for the reader: no word that the reader got nothing', async () => {
    const deliveriesTo = vi.fn(async () => flows.transferRows([distributed(PEOPLE.heirB, 150_000n)] as never));
    letter(PEOPLE.heirA, emptied(), 'en', { ...flows, deliveriesTo });
    await vi.waitFor(() => expect(deliveriesTo).toHaveBeenCalled());
    expect(screen.getByTestId('heir-letter').getAttribute('data-opening')).toBe('openReleased');
    expect(screen.getByTestId('heir-share-empty').textContent).toBe(
      "Nothing the vault covers is left in the owner's wallet to deliver.",
    );
  });

  it('never reads the vault events while something is still to deliver to the reader', () => {
    const deliveriesTo = vi.fn(async () => []);
    const loaded = loadedWith({ state: 'releasedInherit', pending: 'releasedInherit', ...T });
    letter(PEOPLE.heirA, loaded, 'en', { ...flows, deliveriesTo });
    expect(deliveriesTo).not.toHaveBeenCalled();
  });

  it('lists each recipient once, with their amounts stacked', () => {
    const base = loadedWith({ state: 'releasedInherit', pending: 'releasedInherit', ...T });
    const status = base.snap.status;
    // The NFT, held and covered, goes to heir 2, who also has 30 % of the token.
    const assets = status.assets.map((a) => (a.index === 1 ? { ...a, held: 1n, coverage: 1n } : a));
    letter(PEOPLE.heirB, { ...base, snap: { ...base.snap, status: { ...status, assets } } });
    const rows = screen.getAllByTestId(/^heir-share-\d$/);
    expect(rows).toHaveLength(2);
    const b = rows.find((r) => r.getAttribute('data-to') === PEOPLE.heirB);
    expect(b?.getAttribute('data-you')).toBe('true');
    expect(b?.querySelectorAll('[data-amount]')).toHaveLength(2);
    expect(b?.textContent?.match(/\(you\)/g)).toHaveLength(1);
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
    expect(screen.getAllByTestId(/^heir-share-\d-\d-uncovered$/).length).toBeGreaterThan(0);
  });

  it('offers no poke and nothing to receive while the owner is on time', () => {
    letter(PEOPLE.heirA);
    expect(screen.getByTestId('heir-move-idle')).toBeTruthy();
    expect(screen.getByTestId('heir-receive-idle')).toBeTruthy();
  });

  it('offers the poke that serves the heir, named by what it does', () => {
    letter(PEOPLE.heirA, loadedWith({ state: 'grace', pending: 'releasedInherit' }));
    expect(screen.getByTestId('heir-poke').textContent).toBe('Release to the heirs');
    // In the heir's words: the vault's generic help would say "nothing comes to your wallet".
    expect(screen.getByTestId('heir-move-help').textContent).toMatch(/^The time to answer the alarm is over/);
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
