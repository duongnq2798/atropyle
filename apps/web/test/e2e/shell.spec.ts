import { expect, test } from './fixtures.ts';
import { expectAccessibleInBothThemes, openSettings, setStoredTheme } from './helpers.ts';
import { captureScreens, SCREEN_MATRIX, shouldCapture } from './screens.ts';

const HERO = 'What happens to your crypto when you can no longer sign?';
const HERO_VI = 'Chuyện gì xảy ra với tài sản crypto của bạn khi bạn không còn ký được nữa?';
/** --atro-bg of globals.css (Task 3): night #0b0d12, vellum #f6f1e7. */
const NIGHT_BG = 'rgb(11, 13, 18)';
const VELLUM_BG = 'rgb(246, 241, 231)';

test('the home page and the 404 page pass axe in both themes', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  await expectAccessibleInBothThemes(page);
  await page.goto(new URL('no-such-page/', state.siteUrl).href);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test.describe('from empty storage', () => {
  // These two test the default, so the suite's night start is off.
  test.use({ firstTheme: null });

  test('vellum is the default whatever the device prefers, and the stored choice changes it', async ({
    page,
    state,
  }) => {
    const background = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    // A device that prefers dark still opens in vellum: vellum is not the system theme (spec §18.4.1, 7C-T12).
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(state.siteUrl);
    await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
    await expect.poll(background).toBe(VELLUM_BG);
    await setStoredTheme(page, 'dark');
    await expect.poll(background).toBe(NIGHT_BG);
    await setStoredTheme(page, 'light');
    await expect.poll(background).toBe(VELLUM_BG);
  });

  test('the theme and the language persist across a reload', async ({ page, state }) => {
    await page.goto(state.siteUrl);
    await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
    // Vellum is the default, and the boot script sets its attribute too.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const settings = await openSettings(page);
    await settings.getByText('Night', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await settings.getByText('Tiếng Việt', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.reload();
    // The boot script sets the theme before the first paint; the language follows after hydration.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { level: 1, name: HERO_VI })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  });
});

test('the skip button moves focus to the main content and keeps the hash', async ({ page, state }) => {
  await page.goto(`${state.siteUrl}#keep`);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('button', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  // A fragment link would have replaced it; the hash carries page parameters (Task 9).
  expect(new URL(page.url()).hash).toBe('#keep');
});

/**
 * A view-transition group paints above the root picture, and the open settings (the Menu sheet on a phone, its
 * dimming, the popover on a desktop) are in the root. So while they are on screen, the header and the footer drop
 * their names and crossfade with the root, instead of showing undimmed above the sheet.
 */
test('a theme change from the open settings keeps the header and the footer under them', async ({ page, state }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  const settings = await openSettings(page);
  await expect(settings).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __parts?: string[] };
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((arg?: Parameters<typeof start>[0]) => {
      const t = start(arg);
      void t.ready.then(() => {
        w.__parts = document
          .getAnimations()
          .map((a) => (a.effect as KeyframeEffect | null)?.pseudoElement ?? '')
          .filter((p) => p.startsWith('::view-transition'));
      });
      return t;
    }) as typeof document.startViewTransition;
  });
  await settings.getByText('Vellum', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const parts = () => page.evaluate(() => (window as unknown as { __parts?: string[] }).__parts);
  await expect.poll(parts).toBeDefined();
  const seen = (await parts()) ?? [];
  expect(seen).toContain('::view-transition-new(root)');
  expect(seen.filter((p) => /site-(header|footer)/.test(p))).toEqual([]);
});

test('screens of the home page and the 404 page, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(300_000);
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  // C10's three, plus vellum at 1440: the weave is drawn in theme tokens, and vellum is one click away.
  await captureScreens(page, 'home', { shots: [...SCREEN_MATRIX, { theme: 'light', lang: 'en', width: 1440 }] });
  // 7C-T5′: the silent question after its sweep: lit wires, the violet pin (1440), the woven title in EN and VI.
  await captureScreens(page, 'home-ask', {
    shots: [SCREEN_MATRIX[0], SCREEN_MATRIX[1], { theme: 'dark', lang: 'vi', width: 1440 }],
    ready: (p) => p.locator('label.ask-chip', { has: p.locator('input[value="s"]') }).click(),
  });
  await page.goto(new URL('no-such-page/', state.siteUrl).href);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await captureScreens(page, '404');
});
