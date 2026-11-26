import type { Locator, Page } from '@playwright/test';
import type { Address } from 'viem';
import { ANVIL, expect, test } from './fixtures.ts';
import { flipCase } from './flows.ts';
import { expectAccessible, setStoredLang, setStoredTheme, settle } from './helpers.ts';
import { walletFor } from './onchain.ts';
import { captureScreens, FULL_MATRIX, shouldCapture } from './screens.ts';
import { warp } from './state.ts';
import type { TestWallet } from './wallet.ts';

/** Seeded Guarded Drill (scripts/lib/seed.ts): heirs ANVIL[2] 70 % and ANVIL[5] 30 %, guardians 3, 4 and 5, k = 2. */
const HEIR_A = ANVIL[2];
const G1 = ANVIL[3];
const G2 = ANVIL[4];
/** Heir and guardian at once. */
const BOTH = ANVIL[5];
/** The new wallet in a recovery: no role yet, not a guardian (the vault refuses a guardian as target). */
const NEW_WALLET = ANVIL[6];

/**
 * The design gate's full matrix (spec §11: 390, 768 and 1440 px, both themes, both languages): the letter is vellum
 * whatever the page, and the app still boots night until 7C T12, so every screen must hold in both.
 */
const SHOTS = FULL_MATRIX;

/**
 * Connects the test wallet until the role region is on the page: after a reload the wallet may reconnect by itself,
 * or not. Idempotent, so it serves as captureScreens' `ready`. For wallets with a role only (every wallet here has
 * one). It waits for the vault first: VaultLoading has no Connect button either, so "no Connect" alone proves nothing
 * (vault.spec's copy is only called after stateIs, vault.spec.ts:333-340).
 */
async function connected(page: Page): Promise<void> {
  await expect(page.getByTestId('vault-state')).toBeVisible({ timeout: 30_000 });
  const region = page.locator('[data-role-focus]');
  const connect = page.getByTestId('vault-guest-connect');
  await expect(async () => {
    if ((await region.count()) > 0) return;
    await expect(connect).toBeVisible({ timeout: 2_000 });
    const sheet = page.getByRole('dialog');
    if (!(await sheet.isVisible())) await connect.click({ timeout: 2_000 });
    await sheet.getByRole('button', { name: 'Test Wallet' }).click({ timeout: 3_000 });
    await expect(region).toHaveCount(1, { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
}

/** A full-page shot starts at the top: the focus on the role region scrolls the page down to it. */
async function connectedAtTop(page: Page): Promise<void> {
  await connected(page);
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * For the screens: the two fields typed, then the page scrolled to its top (the focus on the role region scrolls it).
 * Retried as a whole: right after a reload the wallet may connect twice, and a panel that mounts again starts empty.
 */
async function typeTwice(page: Page, first: string, second: string, shows: string): Promise<void> {
  await connected(page);
  await expect(async () => {
    await page.getByTestId('guardian-target-1').fill(first, { timeout: 2_000 });
    await page.getByTestId('guardian-target-2').fill(second, { timeout: 2_000 });
    await expect(page.getByTestId('guardian-target-1')).toHaveValue(first, { timeout: 1_000 });
    await expect(page.getByTestId(shows)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * captureScreens' matrix as viewport shots: a full-page shot resizes the viewport, and the popover, placed against the
 * viewport, does not come out in it. Same file names; ends in night and English at the viewport it started with.
 */
async function captureViewport(page: Page, name: string, ready: () => Promise<void>): Promise<void> {
  const start = page.viewportSize();
  let theme: string | null = null;
  let lang: string | null = null;
  for (const shot of SHOTS) {
    if (shot.theme !== theme) {
      await setStoredTheme(page, shot.theme);
      theme = shot.theme;
    }
    if (shot.lang !== lang) {
      await setStoredLang(page, shot.lang);
      lang = shot.lang;
    }
    await page.setViewportSize({ width: shot.width, height: 900 });
    await ready();
    await settle(page);
    const scheme = shot.theme === 'dark' ? 'night' : 'vellum';
    await page.screenshot({ path: `test-results/screens/${name}/${scheme}-${shot.lang}-${shot.width}.png` });
  }
  await setStoredLang(page, 'en');
  await setStoredTheme(page, 'dark');
  if (start) await page.setViewportSize(start);
}

/** expectAccessibleInBothThemes reloads and loses the wallet: this one reconnects after each reload. */
async function accessibleInBothThemes(page: Page, ready: Locator): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    await connected(page);
    await expect(ready).toBeVisible();
    await expectAccessible(page);
  }
}

/** The test wallet installs once per page (exposeFunction cannot run twice): later calls switch its account. */
const installed = new WeakMap<Page, TestWallet>();

async function openAs(
  page: Page,
  siteUrl: string,
  vault: Address,
  wallet: (o: { account: Address }) => Promise<TestWallet>,
  account: Address,
) {
  const w = installed.get(page);
  if (w) w.setAccount(account);
  else installed.set(page, await wallet({ account }));
  await page.goto(`${siteUrl}vault/#${vault}`);
  // A goto that changes only the hash keeps the document, and the old account with it: a reload brings the new one.
  if (w) await page.reload();
  await connected(page);
}

test('a guardian votes for a new wallet only after typing it twice, the same, with its checksum', async ({
  page,
  state,
  atro,
  wallet,
}) => {
  const vault = state.seeded.guarded;
  await openAs(page, state.siteUrl, vault, wallet, G1);
  const tab = page.getByTestId('guardian-tab');
  await expect(tab).toBeVisible();
  await expect(page.getByTestId('guardian-warning')).toBeVisible();
  await accessibleInBothThemes(page, tab);

  const vote = page.getByTestId('guardian-vote');
  await expect(vote).toBeDisabled();
  await page.getByTestId('guardian-target-1').fill(NEW_WALLET);
  await page.getByTestId('guardian-target-2').fill(flipCase(NEW_WALLET));
  await expect(page.getByTestId('guardian-target-error')).toHaveAttribute('data-reason', 'invalid');
  await page.getByTestId('guardian-target-2').fill(ANVIL[7]);
  await expect(page.getByTestId('guardian-target-error')).toHaveAttribute('data-reason', 'mismatch');
  await expect(vote).toBeDisabled();
  await page.getByTestId('guardian-target-2').fill(NEW_WALLET.toLowerCase());
  await expect(page.getByTestId('guardian-target-confirmed')).toHaveAttribute('data-target', NEW_WALLET);

  await vote.click();
  await expect(page.getByTestId('guardian-vote-tx')).toBeVisible();
  await expect(page.getByTestId('warning-GUARDIAN_VERIFY_OUT_OF_BAND')).toBeVisible();
  // The fields are read only while the plan is held: it signs the wallet shown.
  await expect(page.getByTestId('guardian-target-1')).toHaveAttribute('readonly', '');
  await expectAccessible(page);
  await page.getByTestId('guardian-vote-tx-send').click();

  await expect(page.getByTestId('guardian-tally-0')).toHaveAttribute('data-votes', '1');
  await expect(page.getByTestId('guardian-my-vote')).toBeVisible();
  const status = await atro.vault(vault).status();
  expect(status.recVotes.find((v) => v.guardian === G1)?.target).toBe(NEW_WALLET);
  expect(status.state).toBe('active');
});

test('a guardian attests and can take it back', async ({ page, state, atro, wallet }) => {
  const vault = state.seeded.guarded;
  await openAs(page, state.siteUrl, vault, wallet, G2);
  await page.getByTestId('guardian-attest').click();
  await expect(page.getByTestId('warning-GUARDIAN_VERIFY_OUT_OF_BAND')).toBeVisible();
  await page.getByTestId('guardian-attest-tx-send').click();
  await expect(page.getByTestId('guardian-attest-count')).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('guardian-unattest')).toBeVisible();
  expect((await atro.vault(vault).status()).inhVoters).toContain(G2);
});

test('an heir reads the letter, moves the vault on, and receives with a hold', async ({
  page,
  state,
  atro,
  wallet,
}) => {
  // The seeded Drill already in grace, heir ANVIL[2]: 200 s later its alarm window is over (as in vault.spec).
  const vault = state.seeded.grace;
  await warp(state, 200);
  await wallet({ account: HEIR_A });
  await page.goto(`${state.siteUrl}vault/#${vault}`);
  await connected(page);
  // The sheet closed on a connection: focus is on the panel region, not lost on the body.
  await expect(page.locator('[data-role-focus]')).toBeFocused();
  const letter = page.getByTestId('heir-letter');
  await expect(letter).toHaveAttribute('data-opening', 'openDue');
  await expect(page.getByTestId('heir-letter-sheet')).toHaveAttribute('data-theme', 'light');
  await accessibleInBothThemes(page, letter);

  await page.getByTestId('heir-poke').click();
  await page.getByTestId('heir-poke-tx-send').click();
  await expect(page.getByTestId('vault-state')).toHaveAttribute('data-state', 'releasedInherit');
  await expect(letter).toHaveAttribute('data-opening', 'openReleased');

  await page.getByTestId('heir-receive').click();
  const send = page.getByTestId('heir-receive-tx-send');
  await expect(send).toBeVisible();
  // R18.16: nothing says "Confirmed" and no knot ties before the receipt.
  await expect(page.getByTestId('heir-receive-tx')).not.toContainText('Confirmed');
  await expect(send.locator('[data-part="knot"]')).toHaveCount(0);
  await expectAccessible(page);
  // A hold: a plain click does not send; Enter sends at once.
  await send.press('Enter');
  await expect(page.getByTestId('heir-received')).toBeVisible();
  await expect(page.getByTestId('heir-results-0')).toHaveAttribute('data-ok', 'true');
  void atro;
});

test('a wallet that is heir and guardian sees both, in tabs', async ({ page, state, wallet }) => {
  await openAs(page, state.siteUrl, state.seeded.guarded, wallet, BOTH);
  await expect(page.getByTestId('vault-roles-tab-guardian')).toBeVisible();
  await expect(page.getByTestId('vault-roles-tab-heir')).toBeVisible();
  await page.getByTestId('vault-roles-tab-heir').click();
  await expect(page.getByTestId('heir-letter')).toBeVisible();
  await page.getByTestId('vault-roles-tab-guardian').click();
  await expect(page.getByTestId('guardian-tab')).toBeVisible();
});

test('the recovery wallet reads its own letter once two guardians vote for it', async ({
  page,
  state,
  atro,
  wallet,
}) => {
  const vault = state.seeded.guarded;
  for (const g of [G1, G2]) {
    const plan = await atro.vault(vault).prepare({ type: 'voteRecovery', target: NEW_WALLET }, { as: g });
    await atro.send(plan, walletFor(state, g));
  }
  expect((await atro.vault(vault).status()).state).toBe('recovery');
  await openAs(page, state.siteUrl, vault, wallet, NEW_WALLET);
  const letter = page.getByTestId('heir-letter');
  await expect(letter).toHaveAttribute('data-recover', 'true');
  await expect(letter).toHaveAttribute('data-opening', 'openRecoverPending');
  await expect(page.getByTestId('heir-receive-idle')).toBeVisible();
  await accessibleInBothThemes(page, letter);
});

test('at 390 px the guardian tab and the letter fit the width, and a word popover stays on screen', async ({
  page,
  state,
  wallet,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const vault = state.seeded.guarded;
  const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth);

  // Both fields filled: the longest state of the tab (two full addresses and the confirmation box).
  await openAs(page, state.siteUrl, vault, wallet, G1);
  await page.getByTestId('guardian-target-1').fill(NEW_WALLET);
  await page.getByTestId('guardian-target-2').fill(NEW_WALLET);
  await expect(page.getByTestId('guardian-target-confirmed')).toBeVisible();
  expect(await scrollWidth()).toBeLessThanOrEqual(390);

  await openAs(page, state.siteUrl, vault, wallet, HEIR_A);
  await expect(page.getByTestId('heir-legend')).toBeVisible();
  expect(await scrollWidth()).toBeLessThanOrEqual(390);

  await page.getByTestId('heir-term-checkIn').click();
  const def = page.getByTestId('heir-term-checkIn-def');
  await expect(def).toBeVisible();
  const box = await page.getByRole('dialog').filter({ has: def }).boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  }
  expect(await scrollWidth()).toBeLessThanOrEqual(390);
});

test('screens', async ({ page, state, atro, wallet }, info) => {
  test.skip(!shouldCapture(info.project.name), 'SCREENS=1, desktop only');
  test.setTimeout(2_400_000);
  const guarded = state.seeded.guarded;
  const tab = () => expect(page.getByTestId('guardian-tab')).toBeVisible();
  const letter = () => expect(page.getByTestId('heir-letter')).toBeVisible();

  await openAs(page, state.siteUrl, guarded, wallet, G1);
  await captureScreens(page, 'vault-guardian', {
    shots: SHOTS,
    ready: async () => {
      await connectedAtTop(page);
      await tab();
    },
  });
  await captureScreens(page, 'vault-guardian-typed', {
    shots: SHOTS,
    ready: () => typeTwice(page, NEW_WALLET, NEW_WALLET, 'guardian-target-confirmed'),
  });
  await captureScreens(page, 'vault-guardian-mismatch', {
    shots: SHOTS,
    ready: () => typeTwice(page, NEW_WALLET, ANVIL[7], 'guardian-target-error'),
  });

  await openAs(page, state.siteUrl, guarded, wallet, HEIR_A);
  await captureScreens(page, 'vault-heir', {
    shots: SHOTS,
    ready: async () => {
      await connectedAtTop(page);
      await letter();
    },
  });
  await captureViewport(page, 'vault-heir-term', async () => {
    await connected(page);
    await page.getByTestId('heir-glossary').scrollIntoViewIfNeeded();
    await page.getByTestId('heir-term-checkIn').click();
    await expect(page.getByTestId('heir-term-checkIn-def')).toBeVisible();
  });

  await openAs(page, state.siteUrl, guarded, wallet, BOTH);
  await captureScreens(page, 'vault-roles-two', {
    shots: SHOTS,
    ready: async () => {
      await connectedAtTop(page);
      await expect(page.getByTestId('vault-roles')).toBeVisible();
    },
  });

  const grace = state.seeded.grace;
  await warp(state, 200);
  await openAs(page, state.siteUrl, grace, wallet, HEIR_A);
  await captureScreens(page, 'vault-heir-due', {
    shots: SHOTS,
    ready: async () => {
      await connectedAtTop(page);
      await letter();
    },
  });
  await page.getByTestId('heir-poke').click();
  await page.getByTestId('heir-poke-tx-send').click();
  await expect(page.getByTestId('vault-state')).toHaveAttribute('data-state', 'releasedInherit');
  await captureScreens(page, 'vault-heir-released', {
    shots: SHOTS,
    ready: async () => {
      await connectedAtTop(page);
      await letter();
    },
  });

  // The receipt lives only in page memory: a reload loses it. Vellum shots by hand, no reload between them.
  await setStoredTheme(page, 'light');
  await connected(page);
  await page.getByTestId('heir-receive').click();
  await page.getByTestId('heir-receive-tx-send').press('Enter');
  await expect(page.getByTestId('heir-received')).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await page.screenshot({ path: `test-results/screens/vault-heir-received/vellum-en-${width}.png`, fullPage: true });
  }
  await setStoredTheme(page, 'dark');

  for (const g of [G1, G2]) {
    await atro.send(
      await atro.vault(guarded).prepare({ type: 'voteRecovery', target: NEW_WALLET }, { as: g }),
      walletFor(state, g),
    );
  }
  await openAs(page, state.siteUrl, guarded, wallet, NEW_WALLET);
  await captureScreens(page, 'vault-heir-recover', {
    shots: SHOTS,
    ready: async () => {
      await connectedAtTop(page);
      await letter();
    },
  });
});
