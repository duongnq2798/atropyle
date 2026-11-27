import type { AtropyleClient } from '@atropyle/sdk';
import type { Page } from '@playwright/test';
import { type Address, createPublicClient, erc20Abi, http } from 'viem';
import { anvil } from 'viem/chains';
import { ANVIL, expect, test } from './fixtures.ts';
import { expectAccessible, setStoredTheme } from './helpers.ts';
import { mint, walletFor } from './onchain.ts';
import { captureScreens, FULL_MATRIX, shouldCapture } from './screens.ts';
import { type E2EState, warp } from './state.ts';
import type { TestWallet } from './wallet.ts';

/** Every seeded Drill's owner (scripts/lib/seed.ts). */
const OWNER = ANVIL[1];
const STRANGER = ANVIL[8];
const KEEPER = ANVIL[7];

/** roles.spec's connected(): the vault first, then the wallet until the role region is on the page. Idempotent. */
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

/**
 * axe in vellum, then night. Each theme reloads the page, which forgets what the test did on it (typed fields, a
 * receipt): `ready` builds the screen under test again and returns once it is on the page. Ends in night.
 */
async function accessibleInBothThemes(page: Page, ready: () => Promise<void>): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    await connected(page);
    await ready();
    await expectAccessible(page);
  }
}

/** The ritual at rest, its hold on the page. */
async function ritualIdle(page: Page): Promise<void> {
  await expect(page.getByTestId('owner-checkin-tx-send')).toBeVisible({ timeout: 30_000 });
}

/** The heirs part open, heir 2 changed to STRANGER: the NFT warning and its box. */
async function heirChanged(page: Page): Promise<void> {
  const fields = page.getByTestId('owner-edit-fields');
  if ((await fields.count()) === 0) await page.getByTestId('owner-edit-heirs').click();
  await expect(fields).toHaveAttribute('data-part', 'heirs');
  await page.getByTestId('owner-edit-heir-1-account').fill(STRANGER);
  await expect(page.getByTestId('owner-edit-remap')).toBeVisible();
}

/** A tied check-in on screen: a reload forgets the receipt, so check in again whenever the tied line is gone. */
async function tiedOnScreen(page: Page): Promise<void> {
  if ((await page.getByTestId('owner-tied').count()) === 0) {
    await ritualIdle(page);
    await page.getByTestId('owner-checkin-tx-send').press('Enter');
  }
  await expect(page.getByTestId('owner-tied')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('owner-ritual-face').locator('[data-part="knot"]')).toHaveCount(1);
}

/** A released vault's owner tab: the closing line and Revoke. */
async function closedOnScreen(page: Page): Promise<void> {
  await expect(page.getByTestId('owner-closed')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('owner-revoke')).toBeVisible();
}

async function openAsOwner(
  page: Page,
  state: E2EState,
  wallet: (o: { account: Address }) => Promise<TestWallet>,
  vault: Address,
): Promise<void> {
  await wallet({ account: OWNER });
  await page.goto(`${state.siteUrl}vault/#${vault}`);
  await connected(page);
  await expect(page.getByTestId('owner-tab')).toBeVisible({ timeout: 30_000 });
}

/** The owner holds the vault's ERC-20 and sets the vault's allowance over it (unlocked anvil account). */
async function holdAndAllow(atro: AtropyleClient, state: E2EState, vault: Address, allowance: bigint): Promise<void> {
  const st = await atro.vault(vault).status();
  const erc20 = st.assets.find((a) => a.asset.kind === 'erc20');
  if (!erc20) throw new Error('the seed has no ERC-20 in this vault');
  await mint(state, erc20.asset.token, OWNER, 1_000_000n);
  await walletFor(state, OWNER).writeContract({
    address: erc20.asset.token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [vault, allowance],
    account: OWNER,
    chain: null,
  });
}

/** The vault's allowance over the owner's ERC-20, read on the chain: coverage is min(allowance, balance), not it. */
async function allowanceOf(atro: AtropyleClient, state: E2EState, vault: Address): Promise<bigint> {
  const erc20 = (await atro.vault(vault).status()).assets.find((a) => a.asset.kind === 'erc20');
  if (!erc20) throw new Error('the seed has no ERC-20 in this vault');
  return createPublicClient({ chain: anvil, transport: http(state.rpcUrl) }).readContract({
    address: erc20.asset.token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [OWNER, vault],
  });
}

/** Coverage 0 %: the owner holds the token, the allowance is taken back. */
const lowerCoverage = (atro: AtropyleClient, state: E2EState, vault: Address) => holdAndAllow(atro, state, vault, 0n);

async function pokeAs(atro: AtropyleClient, state: E2EState, vault: Address, as: Address): Promise<void> {
  const plan = await atro.vault(vault).prepare({ type: 'poke' }, { as });
  await atro.send(plan, walletFor(state, as));
}

/**
 * Where the focus is: BODY when it fell out of the page, else whether the point at the centre of the focused element
 * is the element itself, not the sticky header over it (WCAG 2.2 2.4.11).
 */
async function focusState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return 'BODY';
    const r = a.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && a.contains(hit)
      ? 'clear'
      : `covered by ${hit?.closest('header') ? 'the header' : hit?.tagName}`;
  });
}

/** The order of the ritual's phases: a recorded run may skip some (a fast wallet), never go back. */
const ORDER = ['idle', 'holding', 'wallet', 'sent', 'tied'];

test('the owner checks in with the ritual, and the knot ties only with the receipt', async ({
  page,
  state,
  atro,
  wallet,
}) => {
  const vault = state.seeded.guarded;
  await warp(state, 30);
  await openAsOwner(page, state, wallet, vault);
  const ritual = page.getByTestId('owner-ritual');
  await expect(ritual).toHaveAttribute('data-ritual', 'idle');
  await expect(page.getByTestId('owner-drill')).toHaveAttribute('data-kind', 'guarded');
  await expect(page.getByTestId('owner-due')).toHaveAttribute('data-kind', 'dueActive');
  const send = page.getByTestId('owner-checkin-tx-send');
  await expect(send).toBeVisible();
  // R18.16: nothing says Confirmed and no knot ties before the receipt.
  await expect(page.getByTestId('owner-checkin-tx')).not.toContainText('Confirmed');
  await expect(send.locator('[data-part="knot"]')).toHaveCount(0);
  await expect(page.getByTestId('owner-ritual-face').locator('[data-part="knot"]')).toHaveCount(0);
  await accessibleInBothThemes(page, () => ritualIdle(page));
  const before = await page.getByTestId('vault-last-alive').getAttribute('data-ts');

  // Every phase the page shows, in order, from here to the receipt.
  await ritual.evaluate((el) => {
    const seen: string[] = [el.getAttribute('data-ritual') ?? ''];
    (window as unknown as { __ritual: string[] }).__ritual = seen;
    new MutationObserver(() => seen.push(el.getAttribute('data-ritual') ?? '')).observe(el, {
      attributes: true,
      attributeFilter: ['data-ritual'],
    });
  });
  await page.getByTestId('owner-checkin-tx-send').press('Enter');
  await expect(page.getByTestId('owner-tied')).toBeVisible();
  await expect(ritual).toHaveAttribute('data-ritual', 'tied');
  // The receipt's heading takes the focus, in sight: on a phone the tall ritual card once left it under the header.
  await expect(page.getByTestId('owner-checkin-tx').locator('h3')).toBeFocused();
  await expect.poll(() => focusState(page)).toBe('clear');
  const seen = await page.evaluate(() => (window as unknown as { __ritual: string[] }).__ritual);
  expect(seen.at(-1)).toBe('tied');
  expect(seen.filter((p) => p === 'tied')).toHaveLength(1);
  expect(seen).toContain('wallet');
  const ranks = seen.map((p) => ORDER.indexOf(p));
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  await expect(page.getByTestId('owner-ritual-face').locator('[data-part="knot"]')).toHaveCount(1);

  const block = Number(await page.getByTestId('owner-tied').getAttribute('data-block'));
  expect(block).toBeGreaterThan(0);
  // The digits grouped as the Receipt groups them (a devnet block is short; X Layer's run in the millions).
  await expect(page.getByTestId('owner-tied')).toContainText(
    /Tied at block\u00a0\d{1,3}(?:,\d{3})*\u00a0·\u00a0\d+\.\d\u00a0s/,
  );
  await expect(page.getByTestId('owner-tied')).toContainText(`block\u00a0${block.toLocaleString('en-US')}\u00a0`);
  await expect(page.getByTestId('vault-last-alive')).not.toHaveAttribute('data-ts', before ?? '');
  const st = await atro.vault(vault).status();
  await expect(page.getByTestId('vault-last-alive')).toHaveAttribute('data-ts', st.lastAlive.toString());
  // The thread rides in the receipt's footer: TxCard has put the Receipt in place of the hold.
  await expect(page.getByTestId('owner-checkin-tx-done').getByTestId('owner-ritual-face')).toBeVisible();
  await expect(page.getByTestId('owner-checkin-tx-send')).toHaveCount(0);

  // The tied receipt in both themes (each reload checks in again).
  await accessibleInBothThemes(page, () => tiedOnScreen(page));

  // "Check in again" (a tied knot's reset, never "Start over") prepares the next check-in at once (again()). Its words
  // stand on the card's content edge: the ghost's own padding is taken back.
  const again = page.getByTestId('owner-checkin-reset');
  await expect(again).toHaveText('Check in again');
  const words = await again.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().left;
  });
  const lead = await ritual.locator('p').first().boundingBox();
  expect(Math.abs(words - (lead?.x ?? 0))).toBeLessThanOrEqual(1);
  await again.click();
  await expect(ritual).toHaveAttribute('data-ritual', 'idle');
  await expect(page.getByTestId('owner-checkin-tx-send')).toBeVisible();
});

test('the keyboard keeps its place: Save, Send and Start over, then the check-in and its Start over', async ({
  page,
  state,
  wallet,
}) => {
  const vault = state.seeded.guarded;
  await openAsOwner(page, state, wallet, vault);
  await heirChanged(page);
  await page.getByTestId('owner-edit-remap-ack').check();

  // Save: the button goes with the plan's arrival, and Send takes the focus.
  await page.getByTestId('owner-edit-save').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('owner-edit-save-tx-send')).toBeFocused({ timeout: 30_000 });
  await expect.poll(() => focusState(page)).toBe('clear');
  // Send: the Receipt replaces it, and its heading takes the focus.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('owner-edit-save-tx-done')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('owner-edit-save-tx').locator('h3')).toBeFocused();
  await expect.poll(() => focusState(page)).toBe('clear');
  // Start over: the forms start again from the saved plan (a new key); nothing to save, so the part keeps the focus.
  await page.getByTestId('owner-edit-save-reset').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('owner-edit-unchanged')).toBeVisible();
  await expect(page.getByTestId('owner-edit-heirs')).toBeFocused();
  await expect.poll(() => focusState(page)).toBe('clear');

  // The check-in: Enter on the hold, then Start over prepares the next one and its hold takes the focus.
  await page.getByTestId('owner-checkin-tx-send').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('owner-tied')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('owner-checkin-tx').locator('h3')).toBeFocused();
  await page.getByTestId('owner-checkin-reset').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('owner-checkin-tx-send')).toBeFocused({ timeout: 30_000 });
  await expect.poll(() => focusState(page)).toBe('clear');
});

test('a low coverage is fixed from the owner tab, and the receipt stays', async ({ page, state, atro, wallet }) => {
  const vault = state.seeded.guarded;
  await lowerCoverage(atro, state, vault);
  await openAsOwner(page, state, wallet, vault);
  await expect(page.getByTestId('owner-coverage-0')).toHaveAttribute('data-percent', '0');
  await page.getByTestId('owner-coverage-fix').click();
  await page.getByTestId('owner-coverage-fix-tx-send').click();
  await expect(page.getByTestId('owner-coverage-fix-tx-done')).toBeVisible();
  await expect(page.getByTestId('coverage-low')).toHaveCount(0);
  await expect(page.getByTestId('owner-coverage')).toBeVisible();
  const a = (await atro.vault(vault).status()).assets[0];
  expect(a.coverage >= a.held).toBe(true);
});

test('the owner changes an heir, is told where the NFT goes, and saves', async ({ page, state, atro, wallet }) => {
  const vault = state.seeded.guarded;
  await openAsOwner(page, state, wallet, vault);
  await page.getByTestId('owner-edit-heirs').click();
  await expect(page.getByTestId('owner-edit-fields')).toHaveAttribute('data-part', 'heirs');
  await expect(page.getByTestId('owner-edit-unchanged')).toBeVisible();
  await heirChanged(page);
  await expect(page.getByTestId('owner-edit-save')).toBeDisabled();
  // The warning and its box in both themes; each reload opens Heirs and types STRANGER again.
  await accessibleInBothThemes(page, () => heirChanged(page));
  await expect(page.getByTestId('owner-edit-save')).toBeDisabled();
  await page.getByTestId('owner-edit-remap-ack').check();
  await page.getByTestId('owner-edit-save').click();
  await page.getByTestId('owner-edit-save-tx-send').click();
  await expect(page.getByTestId('owner-edit-save-tx-done')).toBeVisible();
  // The receipt stays; the part buttons wait for Start over.
  await expect(page.getByTestId('owner-edit-guardians')).toBeDisabled();
  const c = await atro.vault(vault).config();
  expect(c.heirs[1].account).toBe(STRANGER);
  await page.getByTestId('owner-edit-save-reset').click();
  await expect(page.getByTestId('owner-edit-unchanged')).toBeVisible();
  await expect(page.getByTestId('owner-edit-heir-1-account')).toHaveValue(STRANGER);
});

test('a released vault: no more check-ins, Deliver for anyone, Revoke still there', async ({
  page,
  state,
  atro,
  wallet,
}) => {
  const vault = state.seeded.grace;
  await warp(state, 200);
  await pokeAs(atro, state, vault, KEEPER);
  // An allowance stands over a token the owner holds, so revokeAll has a real approve(vault, 0) to prepare.
  await holdAndAllow(atro, state, vault, 1_000_000n);
  expect(await allowanceOf(atro, state, vault)).toBe(1_000_000n);
  await openAsOwner(page, state, wallet, vault);
  await expect(page.getByTestId('owner-closed')).toHaveAttribute('data-kind', 'released');
  await expect(page.getByTestId('owner-ritual')).toHaveCount(0);
  await expect(page.getByTestId('vault-distribute')).toBeVisible();
  await expect(page.getByTestId('owner-revoke')).toBeVisible();
  await expect(page.getByTestId('vault-poke')).toHaveCount(0);
  await accessibleInBothThemes(page, () => closedOnScreen(page));

  // Review Focus 13: the SDK prepares revokeAll on a released vault (prepare/actions.ts refuses only an expired Drill's
  // other actions), and signing it zeroes the allowance.
  await page.getByTestId('owner-revoke').click();
  await expect(page.getByTestId('owner-revoke-tx')).toBeVisible({ timeout: 30_000 });
  // The issue list stands on the page from the first paint (ActionFlow), empty while the SDK raised nothing.
  await expect(page.getByTestId('owner-revoke-issues')).toBeEmpty();
  await expect(page.getByTestId('owner-revoke-error')).toHaveCount(0);
  await expect(page.getByTestId('owner-revoke-tx-send')).toBeEnabled();
  await page.getByTestId('owner-revoke-tx-send').click();
  await expect(page.getByTestId('owner-revoke-tx-done')).toBeVisible({ timeout: 30_000 });
  // The allowance itself, before and after: a released vault may read coverage 0 while the allowance stands.
  expect(await allowanceOf(atro, state, vault)).toBe(0n);
});

test('screens', async ({ page, state, atro, wallet }, info) => {
  test.skip(!shouldCapture(info.project.name), 'SCREENS=1 only');
  test.setTimeout(30 * 60_000);
  const guarded = state.seeded.guarded;
  // The design gate's matrix (390, 768 and 1440 px, both languages), vellum first (the brand), then night: the app
  // boots night until 7C T12, and every screen must pass in both themes. `ready` runs after each reload and resize
  // and builds the screen again (the helpers above).
  const BOTH = [...FULL_MATRIX.filter((s) => s.theme === 'light'), ...FULL_MATRIX.filter((s) => s.theme === 'dark')];

  await openAsOwner(page, state, wallet, guarded);
  const idle = async () => {
    await connected(page);
    await ritualIdle(page);
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  await captureScreens(page, 'owner-ritual', { shots: BOTH, ready: idle });

  const editing = async () => {
    await connected(page);
    await heirChanged(page);
    await page.getByTestId('owner-edit').scrollIntoViewIfNeeded();
  };
  await captureScreens(page, 'owner-edit', { shots: BOTH, ready: editing });

  // A reload forgets the receipt: tiedOnScreen checks in again whenever the tied line is gone.
  const tied = async () => {
    await connected(page);
    await tiedOnScreen(page);
    await page.getByTestId('owner-ritual').scrollIntoViewIfNeeded();
  };
  await captureScreens(page, 'owner-tied', { shots: BOTH, ready: tied });

  await warp(state, 200);
  await pokeAs(atro, state, state.seeded.grace, KEEPER);
  await holdAndAllow(atro, state, state.seeded.grace, 1_000_000n);
  await page.goto(`${state.siteUrl}vault/#${state.seeded.grace}`);
  const closed = async () => {
    await connected(page);
    await closedOnScreen(page);
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  await captureScreens(page, 'owner-closed', { shots: BOTH, ready: closed });
});
