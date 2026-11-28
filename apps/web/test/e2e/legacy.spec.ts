import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** 4 kB of every character base64url uses: the shape of a long signing payload (as in boot.test.ts). */
const PAYLOAD = Array.from({ length: 4096 }, (_, i) => 'ABYZabyz0189-_'[i % 14]).join('');
const VAULT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

/**
 * Opens a legacy link from another document, so that it is a real page load. Returns the history length before it:
 * a redirect by location.replace adds one entry (the new route), never two.
 */
async function openLegacy(page: Page, siteUrl: string, hash: string): Promise<number> {
  await page.goto(new URL('robots.txt', siteUrl).href);
  const before = await page.evaluate(() => history.length);
  // 'commit': the boot script replaces the document while it parses, so the first one never finishes loading.
  await page.goto(`${siteUrl}${hash}`, { waitUntil: 'commit' });
  return before;
}

test('legacy links land on the new routes', async ({ page, state }) => {
  const cases: [string, string][] = [
    [`#/sign?p=${PAYLOAD}`, `/sign/#p=${PAYLOAD}`],
    // Two p parameters move as they are, so the sign page still refuses the link.
    ['#/sign?p=a&p=b', '/sign/#p=a&p=b'],
    [`#/v/${VAULT}/verify`, `/verify/#${VAULT}`],
    [`#/v/${VAULT}`, `/vault/#${VAULT}`],
    ['#/create?drill=1', '/create/#drill'],
    ['#/status', '/status/'],
  ];
  for (const [hash, want] of cases) {
    const before = await openLegacy(page, state.siteUrl, hash);
    await page.waitForURL((u) => `${u.pathname}${u.hash}` === want);
    expect(await page.evaluate(() => history.length), hash).toBe(before + 1);
  }
});

test('a legacy link opened on the home page that is already open still lands on its new route', async ({
  page,
  state,
}) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Same document, only the fragment changes: no load, so only the boot script's hashchange listener can move it.
  await page.goto(`${state.siteUrl}#/proof`);
  await page.waitForURL((u) => u.pathname === '/proof/');
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto(`${state.siteUrl}#/v/${VAULT}/verify`);
  await page.waitForURL((u) => `${u.pathname}${u.hash}` === `/verify/#${VAULT}`);
});

test('unknown hashes and hashes on other pages stay where they are', async ({ page, state }) => {
  for (const rest of ['#/', '#/nope', '#/v/a/edit', '#drill', '#p=abc', 'no-such-page/#/sign?p=a']) {
    // From another document each time: a hash-only change would not load the page, and the boot script would not run.
    await page.goto(new URL('robots.txt', state.siteUrl).href);
    await page.goto(`${state.siteUrl}${rest}`);
    // Once the page has hydrated, a redirect would already have changed the URL.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(page.url(), rest).toBe(`${state.siteUrl}${rest}`);
  }
});

/**
 * Every shape the old hash router knew (its route.ts, removed with the previous web app in 7C-T12) opens its new page, and
 * that page works: it renders its heading, and /vault/ and /verify/ read the address from the fragment.
 */
test('every page of the old app opens from its legacy link and works there', async ({ page, state }) => {
  const g = state.seeded.guarded;
  const cases: { hash: string; want: string; address?: true }[] = [
    { hash: '#/create', want: '/create/' },
    { hash: '#/create?drill=1', want: '/create/#drill' },
    { hash: '#/proof', want: '/proof/' },
    { hash: '#/status', want: '/status/' },
    { hash: '#/developers', want: '/developers/' },
    { hash: '#/sign', want: '/sign/' },
    { hash: `#/v/${g}`, want: `/vault/#${g}`, address: true },
    { hash: `#/v/${g}/`, want: `/vault/#${g}`, address: true },
    { hash: `#/v/${g}/verify`, want: `/verify/#${g}`, address: true },
    // The old app's bad-address route: the vault page shows its own state for it.
    { hash: '#/v/0x1234', want: '/vault/#0x1234' },
    // The document path the old app was also reachable at.
    { hash: 'index.html#/proof', want: '/proof/' },
  ];
  for (const c of cases) {
    const before = await openLegacy(page, state.siteUrl, c.hash);
    await page.waitForURL((u) => `${u.pathname}${u.hash}` === c.want);
    expect(await page.evaluate(() => history.length), c.hash).toBe(before + 1);
    await expect(page.getByRole('heading', { level: 1 }), c.hash).toBeVisible();
    if (c.address) await expect(page.locator('html'), c.hash).toHaveAttribute('data-hash', 'address');
  }
});
