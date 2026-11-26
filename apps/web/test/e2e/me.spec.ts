import { DRILL_LIFETIME_SECONDS } from '@atropyle/sdk';
import type { Page, Route } from '@playwright/test';
import { type Address, createWalletClient, http, keccak256, toHex } from 'viem';
import { ANVIL, expect, test } from './fixtures.ts';
import { connectFrom } from './flows.ts';
import { expectAccessible, expectAccessibleInBothThemes, setStoredTheme } from './helpers.ts';
import { OKX_ORIGINS } from './network.ts';
import { captureScreens, FULL_MATRIX, shouldCapture } from './screens.ts';
import { warp } from './state.ts';

type Section = 'own' | 'guard' | 'inherit';

const meUrl = (siteUrl: string) => new URL('me/', siteUrl).href;
const rows = (page: Page, s: Section) => page.getByTestId(`me-section-${s}`).getByTestId('me-row');
const lower = (vs: readonly string[]) => vs.map((v) => v.toLowerCase());
/** A list's vaults in the order the page shows them, lowercased. */
const vaultsIn = async (page: Page, s: Section) =>
  lower(await rows(page, s).evaluateAll((els) => els.map((e) => e.getAttribute('data-vault') ?? '')));
const statesIn = (page: Page, s: Section) =>
  rows(page, s).evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));

/** Opens /me/ and connects from the page's own button: the header's "Connect wallet" has the same name. */
async function openAs(page: Page, siteUrl: string): Promise<void> {
  await page.goto(meUrl(siteUrl));
  await connectFrom(page, page.getByTestId('me-connect'));
}

test('without a wallet, /me/ says what connecting shares and gives the command that reads the same list', async ({
  page,
  state,
}) => {
  await page.goto(meUrl(state.siteUrl));
  await expect(page.getByRole('heading', { level: 1, name: 'My vaults' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Connect a wallet to see its vaults' })).toBeVisible();
  await expect(page.getByTestId('me-cli')).toContainText('npx -y atropyle vaults <address>');
  await expectAccessibleInBothThemes(page, page.getByTestId('me-connect'));
});

test('the owner of the three seeded Drills sees them under "Vaults you own", newest first', async ({
  page,
  state,
  wallet,
}) => {
  const owner = ANVIL[1];
  await wallet({ account: owner });
  await openAs(page, state.siteUrl);
  await expect(rows(page, 'own')).toHaveCount(3);
  const { guarded, simple, grace } = state.seeded;
  expect(await vaultsIn(page, 'own')).toEqual(lower([guarded, simple, grace]));
  expect(await statesIn(page, 'own')).toEqual(['active', 'active', 'grace']);
  await expect(page.getByTestId('me-section-guard-empty')).toBeVisible();
  await expect(page.getByTestId('me-section-inherit-empty')).toBeVisible();
  await expect(page.getByTestId('me-status')).toHaveText('3 vaults name this wallet.');
  await expect(page.getByTestId('me-cli')).toContainText(new RegExp(`npx -y atropyle vaults ${owner}`, 'i'));
  await expect(page.getByTestId('me-named')).toBeVisible();
  await expect(page.getByTestId('me-truncated')).toHaveCount(0);
  // Each theme reloads the page; the wallet comes back through eth_accounts.
  await expectAccessibleInBothThemes(page, rows(page, 'own').first());
});

test('a guardian who is also an heir sees the vault in both lists, and nothing scrolls sideways', async ({
  page,
  state,
  wallet,
}) => {
  await wallet({ account: ANVIL[5] });
  await openAs(page, state.siteUrl);
  await expect(rows(page, 'guard')).toHaveCount(1);
  expect(await vaultsIn(page, 'guard')).toEqual(lower([state.seeded.guarded]));
  expect(await vaultsIn(page, 'inherit')).toEqual(lower([state.seeded.guarded]));
  await expect(rows(page, 'guard')).toContainText('You are an heir too');
  await expect(rows(page, 'inherit')).toContainText('You guard it too');
  await expect(page.getByTestId('me-section-own-empty').locator('a[href="/create/#drill"]')).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width} px`).toBe(width);
  }
  // The address draws as one block of two rows of five (src/ui/address.tsx), so two addresses compare row by row: a
  // phone-wide row must leave it the width for that, in every list.
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await addressLines(page), `${width} px`).toEqual([2, 2, 2, 2]);
  }
});

/** How many lines each address in the lists draws on, in page order. */
const addressLines = (page: Page) =>
  page
    .getByTestId('me-row')
    .locator('[data-part="groups"]')
    .evaluateAll((els) =>
      els.map(
        (el) => new Set([...el.querySelectorAll(':scope > span')].map((g) => g.getBoundingClientRect().top)).size,
      ),
    );

/**
 * Where the focus ring of the focused element falls outside the box of an ancestor that clips it, or 'whole'. The
 * ring is the border box grown by outline-offset + outline-width (Chromium draws it there).
 */
const ringClip = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a?.matches(':focus-visible')) return 'not focus-visible';
    const s = getComputedStyle(a);
    if (s.outlineStyle === 'none' || Number.parseFloat(s.outlineWidth) === 0) return 'no ring';
    const grow = Number.parseFloat(s.outlineOffset) + Number.parseFloat(s.outlineWidth);
    const r = a.getBoundingClientRect();
    for (let p = a.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
      const b = p.getBoundingClientRect();
      const left = b.left + p.clientLeft;
      const top = b.top + p.clientTop;
      const out =
        r.left - grow < left - 0.5 ||
        r.top - grow < top - 0.5 ||
        r.right + grow > left + p.clientWidth + 0.5 ||
        r.bottom + grow > top + p.clientHeight + 0.5;
      if (out) return `clipped by <${p.tagName.toLowerCase()} class="${p.className}">`;
    }
    return 'whole';
  });

test('the jump links of the overview show their whole focus ring, in both themes', async ({
  page,
  state,
  wallet,
}, info) => {
  await wallet({ account: ANVIL[5] });
  await openAs(page, state.siteUrl);
  await expect(rows(page, 'guard')).toHaveCount(1);
  const strip = page.getByTestId('me-overview');
  const links = strip.getByRole('link');
  await expect(links).toHaveCount(3);
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    await expect(rows(page, 'guard')).toHaveCount(1);
    // From the keyboard, as a reader would: Tab until the first jump link has focus.
    for (let i = 0; i < 40 && !(await links.first().evaluate((a) => a === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    for (let i = 0; i < 3; i++) {
      if (i > 0) await page.keyboard.press('Tab');
      await expect(links.nth(i)).toBeFocused();
      expect(await ringClip(page), `link ${i + 1}, ${theme}`).toBe('whole');
      await strip.screenshot({ path: info.outputPath(`focus-${theme === 'dark' ? 'night' : 'vellum'}-${i + 1}.png`) });
    }
  }
});

test('a wallet that no vault names gets the empty state and the rehearsal', async ({ page, state, wallet }) => {
  await wallet({ account: ANVIL[6] });
  await openAs(page, state.siteUrl);
  const empty = page.getByTestId('me-empty');
  await expect(empty.getByRole('heading', { level: 2 })).toHaveText(
    'This wallet has no vaults yet, as owner, guardian or heir.',
  );
  await expect(empty.locator('a[href="/create/#drill"]')).toHaveText('Rehearse one in about 6 minutes');
  await expect(page.getByTestId('me-status')).toHaveText('No vault names this wallet yet.');
  await expect(page.getByTestId('me-section-own')).toHaveCount(0);
  // The notes stand under the empty state too (R-T8-26).
  await expect(page.getByTestId('me-named')).toBeVisible();
  await expect(page.getByTestId('me-truncated')).toHaveCount(0);
});

test('a Drill past its seven days reads as expired, not as active', async ({ page, state, wallet }) => {
  await warp(state, DRILL_LIFETIME_SECONDS);
  await wallet({ account: ANVIL[1] });
  await openAs(page, state.siteUrl);
  await expect(rows(page, 'own')).toHaveCount(3);
  expect(await statesIn(page, 'own')).toEqual(['expired', 'expired', 'expired']);
  await expect(rows(page, 'own').first()).toContainText('Drill expired');
});

/** The chain nodes the page reads through; a route added here wins over routeRpcToAnvil (Playwright tries the last first). */
const rpc = (url: URL) => OKX_ORIGINS.includes(url.origin);
/**
 * Every read of the page fails as a node that is down does, after the preflight passes: the SDK calls it
 * RPC_UNAVAILABLE. Each node retries a 5xx three times and the read itself twice (shouldRetry), so the error box
 * comes after some 20 s of reading: hence the longer waits below.
 */
const down = (route: Route) =>
  route.request().method() === 'OPTIONS'
    ? route.fallback()
    : route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'down' });
const SLOW = { timeout: 60_000 };

/**
 * Waits until `done` says the page shows what a shot needs. The page reconnects its wallet after each reload; on a
 * loaded machine that restore can run out of time (RESTORE_TIMEOUT_MS) and leave the page on Connect, so the test
 * connects again, as a person would, and waits once more.
 */
async function until(page: Page, done: () => Promise<boolean>, timeout = 30_000): Promise<void> {
  try {
    await expect.poll(done, { timeout }).toBe(true);
    return;
  } catch {
    await connectFrom(page, page.getByTestId('me-connect'));
  }
  await expect.poll(done, { timeout }).toBe(true);
}
const visible = (page: Page, testId: string) => () => page.getByTestId(testId).isVisible();
const counts = (page: Page, n: number) => async () => {
  for (const s of ['own', 'guard', 'inherit'] as const) if ((await rows(page, s).count()) !== n) return false;
  return true;
};
/** Reading the chain, not reconnecting the wallet: only the first speaks on the status line. */
const reading = (page: Page) => async () =>
  (await page.getByTestId('me-loading').isVisible()) &&
  ((await page.getByTestId('me-status').textContent()) ?? '') !== '';

test('a first read that fails shows the error with Retry, and Retry reads the list', async ({
  page,
  state,
  wallet,
}) => {
  test.setTimeout(300_000);
  await wallet({ account: ANVIL[1] });
  await page.goto(meUrl(state.siteUrl));
  await page.route(rpc, down);
  await connectFrom(page, page.getByTestId('me-connect'));
  const box = page.getByTestId('me-error');
  await expect(box).toBeVisible(SLOW);
  await expect(box).toHaveAttribute('data-code', 'RPC_UNAVAILABLE');
  await expect(page.getByTestId('me-row')).toHaveCount(0);
  // expectAccessibleInBothThemes, with the wait the error needs after each reload.
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    await until(page, visible(page, 'me-error'), SLOW.timeout);
    await expectAccessible(page);
  }
  await page.unroute(rpc, down);
  await box.getByRole('button', { name: 'Retry' }).click();
  await expect(rows(page, 'own')).toHaveCount(3);
  await expect(page.getByTestId('me-error')).toHaveCount(0);
});

test('screens of /me/: connect, reading, the error, the three lists, no vaults', async ({
  page,
  atro,
  state,
  wallet,
}, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(600_000);
  // ANVIL[5] guards and inherits the seeded Guarded Drill. A Drill of its own fills the third list, and the alarm on
  // it shows a second state. Sent from unlocked anvil accounts, as the seed does: no key anywhere.
  const who = ANVIL[5];
  const signer = (account: Address) =>
    createWalletClient({ account, chain: atro.chain, transport: http(state.rpcUrl) });
  const plan = await atro.prepare.createVault(
    atro.plan.template('simple', {
      heirs: [{ account: ANVIL[2] }],
      drill: true,
      assets: [{ kind: 'erc20', token: atro.deployment.feeTokens[0] }],
    }),
    { owner: who, drill: true, salt: keccak256(toHex('e2e:me')) },
  );
  await atro.send(plan, signer(who));
  await warp(state, 130);
  await atro.send(await atro.vault(plan.vault).prepare({ type: 'poke' }, { as: ANVIL[7] }), signer(ANVIL[7]));

  // The design gate's matrix (spec §11: 390, 768 and 1440 px, both themes, both languages) for the three screens a
  // reader stays on; night and vellum at 1440 and 390 px for the two that pass.
  const w = await wallet({ account: who });
  await page.goto(meUrl(state.siteUrl));
  await captureScreens(page, 'me-connect', {
    shots: FULL_MATRIX,
    ready: async () => {
      await expect(page.getByTestId('me-connect')).toBeVisible();
    },
  });
  await connectFrom(page, page.getByTestId('me-connect'));
  await captureScreens(page, 'me-lists', {
    shots: FULL_MATRIX,
    ready: async () => {
      await until(page, counts(page, 1));
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  });

  // Reading: the nodes never answer, so the page stays on its first read.
  const hold = (_route: Route) => undefined;
  await page.route(rpc, hold);
  await page.reload();
  await captureScreens(page, 'me-loading', {
    vellum: true,
    ready: async () => {
      await until(page, reading(page));
    },
  });
  await page.unroute(rpc, hold);

  await page.route(rpc, down);
  await page.reload();
  await captureScreens(page, 'me-error', {
    vellum: true,
    ready: async () => {
      await until(page, visible(page, 'me-error'), SLOW.timeout);
    },
  });
  await page.unroute(rpc, down);

  w.setAccount(ANVIL[6]);
  await page.reload();
  await captureScreens(page, 'me-empty', {
    shots: FULL_MATRIX,
    ready: async () => {
      await until(page, visible(page, 'me-empty'));
    },
  });
});
