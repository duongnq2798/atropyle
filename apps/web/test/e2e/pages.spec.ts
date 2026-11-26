import { VERSION } from '@atropyle/sdk';
import type { Page } from '@playwright/test';
import { expectedCheckCount } from '../../src/app/status/checks.ts';
import { ANVIL, expect, test } from './fixtures.ts';
import { connectWallet, expectAccessibleInBothThemes, setStoredLang } from './helpers.ts';
import { OKX_ORIGINS } from './network.ts';
import { captureScreens, FULL_MATRIX, SCREEN_MATRIX, shouldCapture, VELLUM_MATRIX } from './screens.ts';

const at = (siteUrl: string, path: string) => new URL(path, siteUrl).href;

test('/status/ shows the chain counters first, then the checks, and its diagnostics hold no wallet address', async ({
  page,
  state,
  wallet,
  atro,
  deployment,
}) => {
  await wallet({ account: ANVIL[1] });
  await page.goto(at(state.siteUrl, 'status/'));
  const main = page.getByRole('main');
  // Counters first (ruling T10-R2): the first section of the page, read on load.
  await expect(main.locator('section').first()).toHaveAttribute('data-testid', 'counters');
  const expected = await atro.counters({ maxVaults: 200 });
  const vaults = main.getByTestId('counter-vaults');
  await expect(vaults).toHaveAttribute('data-all', String(expected.vaults.all));
  await expect(main.getByTestId('counter-drills')).toHaveAttribute(
    'data-all',
    String(expected.vaults.all - expected.paid.all),
  );
  await expect(main.getByTestId('counter-paid')).toHaveAttribute('data-all', String(expected.paid.all));
  // Nothing counted on this device yet: releases cover only what was read, and the page says so.
  if (!expected.complete) await expect(main.getByTestId('counters-partial')).toBeVisible();
  await expect(main.getByTestId('stats-none')).toBeVisible();

  // The full count from the events, then the counters again with every vault it found.
  await main.getByTestId('stats-load').click();
  const stats = await atro.stats();
  await expect(main.getByTestId('stat-vaults')).toHaveAttribute('data-value', String(stats.vaults.total));
  await expect(main.getByTestId('stat-drills')).toHaveAttribute('data-value', String(stats.vaults.drill));
  await expect(main.getByTestId('stat-checkIns')).toHaveAttribute('data-value', String(stats.checkIns));
  await expect(main.getByTestId('counters-partial')).toBeHidden();
  await expect(main.getByTestId('counter-releases')).toHaveAttribute('data-lower-bound', 'false');

  await expect(page.getByTestId('status-integrity')).toHaveAttribute('data-ok', 'true');
  // The loading list draws this many rows (fix round 1): the real report must have as many.
  await expect(page.getByTestId('status-check')).toHaveCount(expectedCheckCount(deployment));
  for (const row of await page.getByTestId('status-check').all())
    await expect(row).toHaveAttribute('data-label', 'true');
  await expect(page.getByTestId('status-rpc-0')).toHaveAttribute('data-ok', 'true');
  await expect(page.getByTestId('glance-contracts')).toHaveAttribute('data-tone', 'ok');
  await expect(page.getByTestId('glance-backend')).toHaveAttribute('data-tone', 'off');
  await expect(page.getByTestId('status-backend-off')).toBeVisible();
  await expect(page.getByTestId('status-crosscheck')).not.toBeChecked();

  await connectWallet(page);
  await expect(page.getByTestId('status-wallets')).toContainText('Test Wallet');
  await page.getByText('Show what will be copied').click();
  const text = (await page.getByTestId('status-diagnostics').textContent()) ?? '';
  expect(JSON.parse(text)).toMatchObject({
    sdk: VERSION,
    target: 'deweb',
    page: at(state.siteUrl, 'status/'),
    chainId: 31337,
    crossCheck: false,
    lang: 'en',
  });
  expect(text.toLowerCase()).not.toContain(ANVIL[1].toLowerCase());
  expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/);
  await expectAccessibleInBothThemes(page, page.getByTestId('status-integrity'));
});

test('/developers/ shows the pinned commands, the contracts and the reusable circuits', async ({
  page,
  state,
  deployment,
}) => {
  await page.goto(at(state.siteUrl, 'developers/'));
  await expect(page.getByText(`npx -y atropyle@${VERSION} verify`)).toBeVisible();
  await expect(page.getByTestId('dev-published')).toContainText(VERSION);
  await expect(page.getByTestId('dev-contract-factory')).toHaveAttribute('data-address', deployment.factory);
  await expect(page.getByTestId('dev-circuit-kofn5')).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test('/privacy/ says what is kept and where', async ({ page, state }) => {
  await page.goto(at(state.siteUrl, 'privacy/'));
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('A sign-up you do not confirm within 48 hours is deleted.')).toBeVisible();
  await expect(page.getByText('It never asks the Atropyle backend.', { exact: false })).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test('a missing page suggests the nearest page, or the vault for an address', async ({ page, state }) => {
  await page.goto(at(state.siteUrl, 'prof/'));
  const suggest = page.getByTestId('not-found-suggest');
  await expect(suggest.getByRole('link', { name: '/proof/' })).toHaveAttribute('href', '/proof/');
  // The suggestion leads; the way home steps back (globals.css, ruling T10-R8).
  await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await expectAccessibleInBothThemes(page, suggest);
  await page.goto(at(state.siteUrl, state.seeded.guarded));
  const vault = page.getByTestId('not-found-vault');
  // /vault/ and /verify/ belong to 7B: asserted by href, not followed (ruling T10-R9).
  await expect(vault.getByRole('link', { name: 'Open the vault' })).toHaveAttribute(
    'href',
    `/vault/#${state.seeded.guarded}`,
  );
  await expect(vault.getByRole('link', { name: 'Verify the vault' })).toHaveAttribute(
    'href',
    `/verify/#${state.seeded.guarded}`,
  );
});

test('nothing scrolls sideways at 390 px on the four pages, in English and in Vietnamese', async ({ page, state }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 900 });
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth);
  for (const lang of ['en', 'vi'] as const) {
    await page.goto(at(state.siteUrl, 'privacy/'));
    await setStoredLang(page, lang);
    // Checks, node URLs, addresses and keccaks must wrap (Review Focus 11), so /status/ is measured once it is full.
    await page.goto(at(state.siteUrl, 'status/'));
    await expect(page.getByTestId('counter-vaults')).toBeVisible();
    await expect(page.getByTestId('status-integrity')).toBeVisible();
    await expect(page.getByTestId('status-rpc-0')).toBeVisible();
    expect(await wide(), `status/ ${lang}`).toBeLessThanOrEqual(390);
    for (const path of ['developers/', 'privacy/']) {
      await page.goto(at(state.siteUrl, path));
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      expect(await wide(), `${path} ${lang}`).toBeLessThanOrEqual(390);
    }
    await page.goto(at(state.siteUrl, state.seeded.guarded));
    await expect(page.getByTestId('not-found-vault')).toBeVisible();
    expect(await wide(), `404 vault ${lang}`).toBeLessThanOrEqual(390);
  }
});

test('screens', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'screens are taken only with SCREENS=1 on desktop');
  test.setTimeout(900_000);
  // The design gate's full matrix (390, 768 and 1440 px, vellum and night, English and Vietnamese), vellum first.
  const full = [...FULL_MATRIX].sort((a, b) => (a.theme === b.theme ? 0 : a.theme === 'light' ? -1 : 1));
  const statusReady = async (p: Page) => {
    await expect(p.getByTestId('counter-vaults')).toBeVisible();
    await expect(p.getByTestId('status-integrity')).toBeVisible();
    await expect(p.getByTestId('status-rpc-0')).toBeVisible();
  };
  await page.goto(at(state.siteUrl, 'status/'));
  await captureScreens(page, '7C-T10-status', { shots: full, ready: statusReady });
  // Counted on this device: the event count fills in, and the counters read every vault it found.
  await page.getByTestId('stats-load').click();
  await expect(page.getByTestId('stat-vaults')).toBeVisible();
  await captureScreens(page, '7C-T10-status-counted', {
    shots: [...VELLUM_MATRIX, ...SCREEN_MATRIX],
    ready: statusReady,
  });
  await page.goto(at(state.siteUrl, 'developers/'));
  await captureScreens(page, '7C-T10-developers', { shots: full });
  await page.goto(at(state.siteUrl, 'privacy/'));
  await captureScreens(page, '7C-T10-privacy', { shots: full });
  await page.goto(at(state.siteUrl, 'prof/'));
  await captureScreens(page, '7C-T10-404-suggest', {
    shots: full,
    ready: async (p) => {
      await expect(p.getByTestId('not-found-suggest')).toBeVisible();
    },
  });
  await page.goto(at(state.siteUrl, state.seeded.guarded));
  await captureScreens(page, '7C-T10-404-vault', {
    shots: full,
    ready: async (p) => {
      await expect(p.getByTestId('not-found-vault')).toBeVisible();
    },
  });
});

test('screens of /status/ while it reads, and when every node fails', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'screens are taken only with SCREENS=1 on desktop');
  test.setTimeout(300_000);
  const shots = [...VELLUM_MATRIX, ...SCREEN_MATRIX];
  // Loading: every node call waits, so the skeletons and spinners stay (the route is the latest, so it wins).
  await page.route(
    (url) => OKX_ORIGINS.includes(url.origin),
    () => new Promise<void>(() => undefined),
  );
  await page.goto(at(state.siteUrl, 'status/'));
  await captureScreens(page, '7C-T10-status-loading', {
    shots,
    ready: async (p) => {
      await expect(p.getByTestId('counters').locator('ul[aria-busy="true"]')).toBeVisible();
    },
  });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  // Error: every node refuses, then the reads give up and show their Retry.
  await page.route(
    (url) => OKX_ORIGINS.includes(url.origin),
    (route) => route.abort('connectionrefused'),
  );
  await page.goto(at(state.siteUrl, 'status/'));
  await captureScreens(page, '7C-T10-status-error', {
    shots,
    ready: async (p) => {
      await expect(p.getByTestId('counters').getByTestId('error')).toBeVisible({ timeout: 60_000 });
    },
  });
});

test('/status/ keeps the shape of its lists while it reads, and nodes that do not answer are no broken contract', async ({
  page,
  state,
  deployment,
}) => {
  test.setTimeout(120_000);
  // Every node call waits: the lists hold the rows they will have, and "Check again" waits with them.
  await page.route(
    (url) => OKX_ORIGINS.includes(url.origin),
    () => new Promise<void>(() => undefined),
  );
  await page.goto(at(state.siteUrl, 'status/'));
  await expect(page.getByTestId('status-integrity-skeleton').locator('li')).toHaveCount(expectedCheckCount(deployment));
  await expect(page.getByTestId('status-rpcs-skeleton').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('status-recheck')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('glance-contracts')).toHaveAttribute('data-tone', 'checking');
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // Every node refuses: the nodes are the problem, the contracts are unknown, not red.
  await page.route(
    (url) => OKX_ORIGINS.includes(url.origin),
    (route) => route.abort('connectionrefused'),
  );
  await page.goto(at(state.siteUrl, 'status/'));
  await expect(page.getByTestId('glance-nodes')).toHaveAttribute('data-tone', 'bad', { timeout: 30_000 });
  await expect(page.getByTestId('glance-contracts')).toHaveAttribute('data-tone', 'unknown', { timeout: 60_000 });
  await expect(page.getByTestId('status-rpc-0')).toHaveAttribute('data-ok', 'false');
  await expect(page.getByTestId('status-recheck')).not.toHaveAttribute('aria-busy', 'true');
});
