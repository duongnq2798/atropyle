import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { expectAccessible, expectAccessibleInBothThemes, setStoredTheme } from './helpers.ts';
import { captureScreens, FULL_MATRIX, type Shot, shouldCapture } from './screens.ts';

const TOKEN = 'Ab3_-'.repeat(8).concat('xyz');
const at = (siteUrl: string, path: string) => new URL(path, siteUrl).href;
const alerts = (page: Page) => page.getByTestId('alerts');
const inState = (page: Page, state: string) => page.locator(`[data-testid="alerts"][data-state="${state}"]`);

/** A new document on the link, as a click in the mail app opens it. */
async function openLink(page: Page, url: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(url);
}

test('an email link on this build sends nothing, and its token leaves the address bar and the page', async ({
  page,
  state,
}) => {
  // Counts every pushState of each new document, Next's patched one included (it calls through to this one).
  await page.addInitScript(() => {
    const w = window as Window & { __pushes?: number };
    const push = history.pushState.bind(history);
    w.__pushes = 0;
    history.pushState = (...args: Parameters<History['pushState']>) => {
      w.__pushes = (w.__pushes ?? 0) + 1;
      return push(...args);
    };
  });
  await page.goto(state.siteUrl);
  for (const path of ['alerts/confirm/', 'alerts/unsubscribe/']) {
    // Not expectAccessibleInBothThemes: its reload would find the address bar already cleared (7A checklist).
    for (const theme of ['light', 'dark'] as const) {
      await setStoredTheme(page, theme);
      await openLink(page, at(state.siteUrl, `${path}#t=${TOKEN}`));
      // The token is cleared by replaceState, so no history entry is added (Review Focus 1): the length read right
      // after the load stays, and the pushState counter of the init script above stays at 0 (the clear may already
      // have run before the first read).
      const entries = await page.evaluate(() => window.history.length);
      await expect(alerts(page)).toHaveAttribute('data-state', 'hostedOnly');
      expect(await page.evaluate(() => window.history.length), 'history entries').toBe(entries);
      expect(await page.evaluate(() => (window as Window & { __pushes?: number }).__pushes), 'pushState calls').toBe(0);
      expect(page.url()).not.toContain(TOKEN);
      expect(page.url()).not.toContain('t=');
      await expect(page.locator('body')).not.toContainText(TOKEN);
      await expect(page.getByTestId('alerts-token-note')).toBeVisible();
      await expect(page.getByTestId('alerts-stop')).toHaveCount(0);
      await expectAccessible(page);
    }
  }
});

test('a link without its token, or with a cut one, says it is incomplete', async ({ page, state }) => {
  await page.goto(at(state.siteUrl, 'alerts/confirm/#t=short'));
  await expect(alerts(page)).toHaveAttribute('data-state', 'invalid');
  expect(page.url()).not.toContain('t=');
  await page.goto(at(state.siteUrl, 'alerts/unsubscribe/'));
  await expect(alerts(page)).toHaveAttribute('data-state', 'invalid');
  await expect(page.getByTestId('alerts-token-note')).toHaveCount(0);
  await expectAccessibleInBothThemes(page, inState(page, 'invalid'));
});

test('every answer of the hosted pages passes axe in both themes', async ({ page, state }) => {
  const cases: readonly [string, string][] = [
    ['confirm-working', 'working'],
    ['confirm-done', 'done'],
    ['confirm-expired', 'error'],
    ['confirm-error', 'error'],
    ['unsub-ready', 'ready'],
    ['unsub-working', 'working'],
    ['unsub-done', 'done'],
    ['unsub-error', 'error'],
  ];
  for (const [preview, flow] of cases) {
    await openLink(page, at(state.siteUrl, `e2e/alerts/#${preview}`));
    await expect(alerts(page)).toHaveAttribute('data-state', flow);
    await expectAccessibleInBothThemes(page, inState(page, flow));
  }
});

test('the email pages never scroll sideways on a phone, the confirmed address included', async ({ page, state }) => {
  // The preview shows the Address of the confirmed vault; the real link shows the hosted-only answer of this build.
  for (const url of [at(state.siteUrl, 'e2e/alerts/#confirm-done'), at(state.siteUrl, `alerts/confirm/#t=${TOKEN}`)]) {
    await openLink(page, url);
    await expect(alerts(page)).toHaveAttribute('data-state', /^(done|hostedOnly)$/);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${url} at ${width} px`).toBe(width);
    }
  }
});

test('stopping the alerts moves the focus to the title that says it worked', async ({ page, state }) => {
  await openLink(page, at(state.siteUrl, 'e2e/alerts/#unsub-live'));
  const stop = page.getByTestId('alerts-stop');
  await stop.focus();
  await page.keyboard.press('Enter');
  await expect(alerts(page)).toHaveAttribute('data-state', 'done');
  await expect(page.locator('#alerts-title')).toBeFocused();
  await expect(page.locator('#alerts-title')).toHaveText('Alerts stopped');
});

/** R-T9-26, as join.spec.ts: four shots that cover each width, theme and language once; the full matrix for done. */
const REVIEW: readonly Shot[] = [
  { theme: 'light', lang: 'en', width: 1440 },
  { theme: 'light', lang: 'en', width: 768 },
  { theme: 'light', lang: 'vi', width: 390 },
  { theme: 'dark', lang: 'en', width: 390 },
];

test('screens of the email pages', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(900_000);
  const confirmUrl = at(state.siteUrl, `alerts/confirm/#t=${TOKEN}`);
  await openLink(page, confirmUrl);
  await captureScreens(page, 'alerts-hosted-only', {
    shots: REVIEW,
    // The reload of each shot finds the address bar cleared: open the link again, as a new document.
    ready: async () => {
      await openLink(page, confirmUrl);
      await expect(inState(page, 'hostedOnly')).toBeVisible();
    },
  });

  await page.goto(at(state.siteUrl, 'alerts/unsubscribe/'));
  await captureScreens(page, 'alerts-incomplete', {
    shots: REVIEW,
    ready: async () => expect(inState(page, 'invalid')).toBeVisible(),
  });

  const previews: readonly [string, string, readonly Shot[]][] = [
    ['confirm-working', 'working', REVIEW],
    ['confirm-done', 'done', FULL_MATRIX],
    ['confirm-expired', 'error', REVIEW],
    ['confirm-error', 'error', REVIEW],
    ['unsub-ready', 'ready', REVIEW],
    ['unsub-done', 'done', REVIEW],
  ];
  for (const [preview, flow, shots] of previews) {
    await openLink(page, at(state.siteUrl, `e2e/alerts/#${preview}`));
    await captureScreens(page, `alerts-${preview}`, {
      shots,
      ready: async () => expect(inState(page, flow)).toBeVisible(),
    });
  }
});
