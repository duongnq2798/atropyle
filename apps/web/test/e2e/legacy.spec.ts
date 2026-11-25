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

test('unknown hashes and hashes on other pages stay where they are', async ({ page, state }) => {
  for (const rest of ['#/nope', '#/v/a/edit', '#drill', '#p=abc', 'no-such-page/#/sign?p=a']) {
    // From another document each time: a hash-only change would not load the page, and the boot script would not run.
    await page.goto(new URL('robots.txt', state.siteUrl).href);
    await page.goto(`${state.siteUrl}${rest}`);
    // Once the page has hydrated, a redirect would already have changed the URL.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(page.url(), rest).toBe(`${state.siteUrl}${rest}`);
  }
});
