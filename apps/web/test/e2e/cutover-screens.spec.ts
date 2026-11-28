import type { Page } from '@playwright/test';
import { ANVIL, expect, test } from './fixtures.ts';
import { openSettings, setStoredTheme, settle } from './helpers.ts';
import { captureScreens, type Shot, shouldCapture } from './screens.ts';
import type { E2EState } from './state.ts';

/**
 * Spec §18.5 C10 for the cutover (7C-T12): every route in vellum and night, English and Vietnamese, at 1440 and 390 px.
 * Ordered so the theme and the language each change as seldom as possible: every change is a reload.
 */
const T12_MATRIX: readonly Shot[] = (['light', 'dark'] as const).flatMap((theme, t) =>
  (t === 0 ? (['en', 'vi'] as const) : (['vi', 'en'] as const)).flatMap((lang, l) =>
    ((t + l) % 2 === 0 ? [1440, 390] : [390, 1440]).map((width): Shot => ({ theme, lang, width })),
  ),
);

interface Screen {
  name: string;
  path: (seeded: E2EState['seeded']) => string;
  ready: (page: Page) => Promise<void>;
}
const heading = (page: Page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

const SCREENS: readonly Screen[] = [
  { name: 'home', path: () => '', ready: heading },
  { name: 'create', path: () => 'create/', ready: heading },
  {
    name: 'vault',
    path: (s) => `vault/#${s.guarded}`,
    ready: (page) =>
      expect(page.getByTestId('vault-state')).toHaveAttribute('data-state', 'active', { timeout: 30_000 }),
  },
  {
    name: 'verify',
    path: (s) => `verify/#${s.guarded}`,
    ready: (page) =>
      expect(page.locator('[data-testid="verify-overall"]:not([data-ok="pending"])')).toBeVisible({ timeout: 60_000 }),
  },
  { name: 'proof', path: () => 'proof/', ready: heading },
  { name: 'me', path: () => 'me/', ready: heading },
  {
    name: 'join',
    path: (s) => `join/#${s.guarded}.heir`,
    ready: (page) => expect(page.locator('[data-testid="join"][data-state="ready"]')).toBeVisible({ timeout: 30_000 }),
  },
  { name: 'alerts-confirm', path: () => 'alerts/confirm/', ready: heading },
  { name: 'alerts-unsubscribe', path: () => 'alerts/unsubscribe/', ready: heading },
  {
    name: 'status',
    path: () => 'status/',
    ready: (page) => expect(page.getByTestId('status-integrity')).toBeVisible({ timeout: 30_000 }),
  },
  { name: 'developers', path: () => 'developers/', ready: heading },
  { name: 'privacy', path: () => 'privacy/', ready: heading },
  { name: '404', path: () => 'no-such-page/', ready: heading },
];

for (const s of SCREENS) {
  test(`C10 screens of ${s.name}`, async ({ page, state }, info) => {
    test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
    test.setTimeout(600_000);
    await page.goto(new URL(s.path(state.seeded), state.siteUrl).href);
    await s.ready(page);
    await captureScreens(page, `t12-${s.name}`, { shots: T12_MATRIX, ready: s.ready });
  });
}

test('C10 screens of /sign/, opened from the legacy link the SDK prints', async ({ page, atro, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(600_000);
  const plan = await atro.vault(state.seeded.simple).prepare({ type: 'checkIn' }, { as: ANVIL[1] });
  await page.goto(atro.handoff.link(plan, state.siteUrl));
  await expect(page).toHaveURL(/\/sign\/#p=/);
  const ready = (p: Page) => expect(p.getByTestId('sign-check-decoded')).toBeVisible({ timeout: 30_000 });
  await ready(page);
  await captureScreens(page, 't12-sign', { shots: T12_MATRIX, ready });
});

test('C10 screens of the settings: the checked theme and language read in both themes', async ({
  page,
  state,
}, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(300_000);
  await page.goto(state.siteUrl);
  await heading(page);
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const settings = await openSettings(page);
      await expect(settings).toBeVisible();
      await settle(page);
      const scheme = theme === 'dark' ? 'night' : 'vellum';
      await page.screenshot({ path: `test-results/screens/t12-settings/${scheme}-en-${width}.png` });
      await page.keyboard.press('Escape');
      await expect(settings).toBeHidden();
    }
  }
});
