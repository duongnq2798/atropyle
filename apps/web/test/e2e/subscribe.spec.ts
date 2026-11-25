import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { expectAccessible, setStoredTheme } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';

/** The vault of src/app/e2e/subscribe/page.e2e.tsx. */
const VAULT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const box = (page: Page, id: string): Locator => page.locator(`[data-preview="${id}"]`).getByTestId('subscribe');

async function open(page: Page, siteUrl: string): Promise<void> {
  await page.goto(new URL('e2e/subscribe/', siteUrl).href);
  await expect(box(page, 'owner')).toHaveAttribute('data-mode', 'form');
}

/**
 * Brings each preview to the state it shows: sent, refused, invalid and sending. Idempotent, because a theme or a
 * language switch reloads the page and captureScreens runs it before every shot.
 */
async function drive(page: Page): Promise<void> {
  const sent = box(page, 'sent');
  if ((await sent.getAttribute('data-mode')) === 'form') {
    await sent.getByTestId('subscribe-email').fill('ana@example.com');
    await sent.getByTestId('subscribe-send').click();
  }
  await expect(sent).toHaveAttribute('data-mode', 'done');

  const invalid = box(page, 'invalid').getByTestId('subscribe-email');
  if ((await invalid.getAttribute('aria-invalid')) !== 'true') {
    await invalid.fill('ana@example');
    await box(page, 'invalid').getByTestId('subscribe-send').click();
  }
  await expect(invalid).toHaveAttribute('aria-invalid', 'true');

  const refused = box(page, 'refused');
  if ((await refused.getByTestId('subscribe-error').count()) === 0) {
    await refused.getByTestId('subscribe-email').fill('ana@example.com');
    await refused.getByTestId('subscribe-send').click();
  }
  await expect(refused.getByTestId('subscribe-error')).toBeVisible();

  const sending = box(page, 'sending');
  const press = sending.getByTestId('subscribe-send');
  if ((await press.getAttribute('aria-busy')) !== 'true') {
    await sending.getByTestId('subscribe-email').fill('ana@example.com');
    await press.click();
  }
  await expect(press).toHaveAttribute('aria-busy', 'true');
  // The clicks scrolled the page; back at the top, the sticky header stays out of the middle of a full-page shot.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
}

test('every state of SubscribeForm passes axe, in vellum and in night', async ({ page, state }) => {
  await open(page, state.siteUrl);
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    await drive(page);
    await expectAccessible(page);
  }
});

test('SubscribeForm works from the keyboard alone, and the focus follows each step', async ({ page, state }) => {
  await open(page, state.siteUrl);
  const sent = box(page, 'sent');
  const field = sent.getByTestId('subscribe-email');
  await field.focus();
  await page.keyboard.type('ana@example.com');
  await page.keyboard.press('Tab');
  await expect(sent.getByRole('radio', { name: 'English' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(sent.getByRole('radio', { name: 'Tiếng Việt' })).toBeChecked();
  // The bot trap has tabIndex -1, so the next stop is the send button.
  await page.keyboard.press('Tab');
  await expect(sent.getByTestId('subscribe-send')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(sent).toHaveAttribute('data-mode', 'done');
  await expect(sent.getByText('Check your inbox', { exact: true })).toBeFocused();
  await expect(sent).toContainText('ana@example.com');
  await page.keyboard.press('Tab');
  await expect(sent.getByRole('button', { name: 'Use another email address' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(sent).toHaveAttribute('data-mode', 'form');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('ana@example.com');
});

test('on the DeWEB build SubscribeForm is a note with no field, and the note links to the main site', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const live = box(page, 'live');
  await expect(live).toHaveAttribute('data-mode', 'hosted-only');
  await expect(live.getByRole('textbox')).toHaveCount(0);
  await expect(live.getByRole('button')).toHaveCount(0);
  // This build's deployment has no webUrl (global-setup.ts), so the preview hands one to the note itself.
  await expect(box(page, 'note').getByRole('link')).toHaveAttribute('href', `https://atropyle.xyz/join/#${VAULT}.heir`);
});

test('screens of SubscribeForm, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(300_000);
  await open(page, state.siteUrl);
  await captureScreens(page, 'subscribe', { ready: () => drive(page) });
});
