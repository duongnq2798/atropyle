import type { Page, Route } from '@playwright/test';
import { ANVIL, expect, test } from './fixtures.ts';
import { flipCase } from './flows.ts';
import { expectAccessible, expectAccessibleInBothThemes, setStoredTheme } from './helpers.ts';
import { OKX_ORIGINS } from './network.ts';
import { captureScreens, FULL_MATRIX, type Shot, shouldCapture } from './screens.ts';

const at = (siteUrl: string, path: string) => new URL(path, siteUrl).href;
const join = (page: Page) => page.getByTestId('join');
const inState = (page: Page, state: string) => page.locator(`[data-testid="join"][data-state="${state}"]`);
const rpcCalls = (requests: readonly string[]) =>
  requests.filter((u) => /^https?:/.test(u) && OKX_ORIGINS.includes(new URL(u).origin));

/** Connects through the page's own button when no wallet is connected yet; in either language (the sheet's name). */
async function connectHere(page: Page): Promise<void> {
  const ask = page.getByTestId('join-connect');
  if (!(await ask.isVisible())) return;
  await ask.click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Test Wallet' }).click();
  await expect(sheet).toBeHidden();
}

/** Reloads, waits out the wallet's restore, and connects again if the restore ran out of time (R-T8-32). */
async function reconnect(page: Page): Promise<void> {
  await page.reload();
  await expect(join(page)).toHaveAttribute('data-state', 'ready');
  await expect
    .poll(async () => (await page.getByTestId('join-wallet').getAttribute('data-named')) ?? '', { timeout: 15_000 })
    .not.toBe('restoring');
  await connectHere(page);
}

test('an heir opens a real invitation: the vault from the chain, what it means, how to stay safe', async ({
  page,
  state,
}) => {
  await page.goto(at(state.siteUrl, `join/#${state.seeded.guarded}.heir`));
  await expect(join(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.getByRole('heading', { level: 1, name: 'You have been named as an heir' })).toBeVisible();
  await expect(
    page.getByTestId('join-vault').locator(`[data-address="${state.seeded.guarded}"]`).first(),
  ).toBeVisible();
  await expect(page.getByText('This page asks you to sign nothing.')).toBeVisible();
  await expect(page.getByTestId('join-wallet')).toHaveAttribute('data-named', 'none');
  await expect(join(page).getByTestId('subscribe')).toHaveAttribute('data-mode', 'hosted-only');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width} px`).toBe(width);
  }
  await expectAccessibleInBothThemes(page, inState(page, 'ready'));
});

test('the wallet the owner named is recognised, with the heir share; another wallet is told so', async ({
  page,
  state,
  wallet,
}) => {
  const w = await wallet({ account: ANVIL[2] });
  await page.goto(at(state.siteUrl, `join/#${state.seeded.guarded}.heir`));
  await expect(join(page)).toHaveAttribute('data-state', 'ready');
  await connectHere(page);
  const line = page.getByTestId('join-wallet');
  await expect(line).toHaveAttribute('data-named', 'yes');
  await expect(line).toContainText('70%');
  // The sheet gave focus back to the title: the Connect button has left the page.
  await expect(page.locator('#join-title')).toBeFocused();
  // The test wallet announces no accountsChanged: a reload restores the wallet under its new account (me.spec).
  w.setAccount(ANVIL[6]);
  await reconnect(page);
  await expect(line).toHaveAttribute('data-named', 'no');
  w.setAccount(ANVIL[1]);
  await reconnect(page);
  await expect(line).toHaveAttribute('data-named', 'other');
  await expect(line).toContainText('Owner');
});

test('a guardian sees the k and n of the vault, read from the chain', async ({ page, state, wallet }) => {
  await wallet({ account: ANVIL[3] });
  await page.goto(at(state.siteUrl, `join/#${state.seeded.guarded}.guardian`));
  await expect(join(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.getByRole('heading', { level: 1, name: 'You have been asked to be a guardian' })).toBeVisible();
  await connectHere(page);
  await expect(page.getByTestId('join-wallet')).toHaveAttribute('data-named', 'yes');
  await expectAccessibleInBothThemes(page, inState(page, 'ready'));
});

test('a broken or edited invitation reads nothing from the chain and never shows a sign-up', async ({
  page,
  state,
  requests,
}) => {
  const g = state.seeded.guarded;
  const cases: readonly [string, string][] = [
    ['', 'missing'],
    [`#${g}`, 'shape'],
    [`#${g}.owner`, 'role'],
    ['#0x1234.heir', 'address'],
    [`#${flipCase(g)}.heir`, 'address'],
  ];
  for (const [hash, reason] of cases) {
    await page.goto('about:blank');
    await page.goto(at(state.siteUrl, `join/${hash}`));
    await expect(join(page)).toHaveAttribute('data-state', 'invalid');
    await expect(join(page)).toHaveAttribute('data-reason', reason);
    await expect(join(page).getByTestId('subscribe')).toHaveCount(0);
  }
  // A changed checksum is refused by toAddress before the snapshot: no node was asked anything.
  expect(rpcCalls(requests), 'RPC requests for a broken link').toEqual([]);
  await expectAccessibleInBothThemes(page, inState(page, 'invalid'));
});

test('an address with no vault says so and offers no sign-up', async ({ page, state }) => {
  await page.goto(at(state.siteUrl, `join/#${ANVIL[8]}.heir`));
  await expect(join(page)).toHaveAttribute('data-state', 'notVault');
  await expect(join(page).getByRole('textbox')).toHaveCount(0);
  await expect(join(page).getByTestId('subscribe')).toHaveCount(0);
  await expectAccessibleInBothThemes(page, inState(page, 'notVault'));
});

/** The chain nodes the page reads through; a route added here wins over routeRpcToAnvil (Playwright tries the last first). */
const rpc = (url: URL) => OKX_ORIGINS.includes(url.origin);
/** Every read fails as a node that is down does, after the preflight passes (as me.spec's `down`): RPC_UNAVAILABLE. */
const down = (route: Route) =>
  route.request().method() === 'OPTIONS'
    ? route.fallback()
    : route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'down' });
/** Each node retries a 5xx and the read itself retries (shouldRetry): the error comes after some 20 s. */
const SLOW = { timeout: 60_000 };

test('a first read that fails shows the error with Retry in both themes, and Retry reads the vault', async ({
  page,
  state,
}) => {
  test.setTimeout(300_000);
  await page.route(rpc, down);
  await page.goto(at(state.siteUrl, `join/#${state.seeded.guarded}.heir`));
  await expect(inState(page, 'error')).toBeVisible(SLOW);
  const box = page.getByTestId('join-error');
  await expect(box.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(join(page).getByTestId('subscribe')).toHaveCount(0);
  // Not expectAccessibleInBothThemes: after each reload the error needs the longer wait (as me.spec does).
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    await expect(inState(page, 'error')).toBeVisible(SLOW);
    await expectAccessible(page);
  }
  await page.unroute(rpc, down);
  await page.getByTestId('join-error').getByRole('button', { name: 'Retry' }).click();
  await expect(join(page)).toHaveAttribute('data-state', 'ready', SLOW);
  await expect(page.getByTestId('join-error')).toHaveCount(0);
});

/**
 * R-T9-26: the two screens an invited reader meets first get the full matrix (390, 768, 1440 px, both themes, both
 * languages); every other state gets four shots that still cover each width, theme and language once.
 */
const REVIEW: readonly Shot[] = [
  { theme: 'light', lang: 'en', width: 1440 },
  { theme: 'light', lang: 'en', width: 768 },
  { theme: 'light', lang: 'vi', width: 390 },
  { theme: 'dark', lang: 'en', width: 390 },
];

test('screens of /join/: heir, guardian, broken, no vault, loading, failed read', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(900_000);
  const g = state.seeded.guarded;
  const ready =
    (s: string, o = { timeout: 30_000 }) =>
    async () => {
      await expect(inState(page, s)).toBeVisible(o);
      await page.evaluate(() => window.scrollTo(0, 0));
    };

  await page.goto(at(state.siteUrl, `join/#${g}.heir`));
  await captureScreens(page, 'join-heir', { shots: FULL_MATRIX, ready: ready('ready') });

  await page.goto(at(state.siteUrl, `join/#${g}.guardian`));
  await captureScreens(page, 'join-guardian', { shots: REVIEW, ready: ready('ready') });

  await page.goto(at(state.siteUrl, `join/#${flipCase(g)}.heir`));
  await captureScreens(page, 'join-broken', { shots: REVIEW, ready: ready('invalid') });

  await page.goto(at(state.siteUrl, `join/#${ANVIL[8]}.heir`));
  await captureScreens(page, 'join-not-vault', { shots: REVIEW, ready: ready('notVault') });

  // A node that never answers holds the page in its first shape.
  const hang = () => undefined;
  await page.route(rpc, hang);
  await page.goto(at(state.siteUrl, `join/#${g}.heir`));
  await captureScreens(page, 'join-loading', { shots: REVIEW, ready: ready('loading') });
  await page.unroute(rpc, hang);

  await page.route(rpc, down);
  await page.goto(at(state.siteUrl, `join/#${g}.heir`));
  await captureScreens(page, 'join-error', { shots: REVIEW, ready: ready('error', SLOW) });
  await page.unroute(rpc, down);
});

test('screens of /join/ with the named wallet connected', async ({ page, state, wallet }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(600_000);
  await wallet({ account: ANVIL[2] });
  await page.goto(at(state.siteUrl, `join/#${state.seeded.guarded}.heir`));
  await captureScreens(page, 'join-heir-named', {
    shots: REVIEW,
    // A reload that loses the restore connects again (R-T8-32).
    ready: async () => {
      await expect(inState(page, 'ready')).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(async () => (await page.getByTestId('join-wallet').getAttribute('data-named')) ?? '', { timeout: 15_000 })
        .not.toBe('restoring');
      await connectHere(page);
      await expect(page.getByTestId('join-wallet')).toHaveAttribute('data-named', 'yes');
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
    },
  });
});
