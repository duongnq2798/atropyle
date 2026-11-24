import { expect, test } from './fixtures.ts';
import { expectAccessibleInBothThemes, openSettings, setStoredTheme } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';

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

test('the stored theme changes the palette axe checks, and the system preference does not', async ({ page, state }) => {
  const background = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  // Night is not the system theme (spec §18.4.1): emulateMedia leaves it alone, which is why R18.17 exists.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(background).toBe(NIGHT_BG);
  await setStoredTheme(page, 'light');
  await expect.poll(background).toBe(VELLUM_BG);
  await setStoredTheme(page, 'dark');
  await expect.poll(background).toBe(NIGHT_BG);
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

test('the theme and the language persist across a reload', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  // Night is the default and carries no attribute.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  const settings = await openSettings(page);
  await settings.getByText('Vellum', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await settings.getByText('Tiếng Việt', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.reload();
  // The boot script sets the theme before the first paint; the language follows after hydration.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { level: 1, name: HERO_VI })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
});

test('screens of the home page and the 404 page, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(300_000);
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  await captureScreens(page, 'home');
  await page.goto(new URL('no-such-page/', state.siteUrl).href);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await captureScreens(page, '404');
});
