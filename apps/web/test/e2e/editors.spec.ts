import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { expectAccessibleInBothThemes } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';

/** The preview has drawn, with its three plan check issues. Idempotent: captureScreens runs it after every reload. */
async function ready(page: Page): Promise<void> {
  await expect(page.getByTestId('preview-shares-thumb-0')).toBeVisible();
  await expect(page.getByTestId('preview-issues')).toHaveAttribute('data-count', '3');
}

async function open(page: Page, siteUrl: string): Promise<void> {
  await page.goto(new URL('e2e/editors/', siteUrl).href);
  await ready(page);
}

test('every editor passes axe, in vellum and in night', async ({ page, state }) => {
  await open(page, state.siteUrl);
  await expectAccessibleInBothThemes(page, page.getByTestId('preview-shares-thumb-0'));
});

test('the share splitter moves 1% per arrow key, stops at 1%, and a typed percent takes from the next heir', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const thumb = page.getByTestId('preview-shares-thumb-0');
  const percent = (i: number) => page.getByTestId(`preview-shares-percent-${i}`);
  await thumb.focus();
  await page.keyboard.press('ArrowRight');
  await expect(percent(0)).toHaveValue('51');
  await expect(thumb).toHaveAttribute('aria-valuetext', 'Heir 1: 51%, Heir 2: 29%');
  await page.keyboard.press('Home');
  await expect(percent(0)).toHaveValue('1');
  await expect(percent(1)).toHaveValue('79');
  // Heir 3 holds 20%: heir 2 can take all of it but its last 1%.
  await percent(1).fill('99');
  await percent(1).press('Tab');
  await expect(percent(1)).toHaveValue('98');
  await expect(percent(2)).toHaveValue('1');
});

test('an address field names the mistake once it holds a whole address, and says it in its live region', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  await page.getByTestId('preview-show-issues').uncheck();
  await expect(page.getByTestId('preview-issues')).toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('preview-heir-2-account')).toHaveAttribute('data-issue', 'addrDuplicate');
  await expect(page.getByTestId('preview-heir-2-account-live')).toHaveText('This address is already in the list.');
  await expect(page.getByTestId('preview-guardian-2')).toHaveAttribute('data-issue', 'addrChecksum');
  await expect(
    page.getByText('Check it in groups of four: 0x 9965 507D 1a55 bcC2 695C 58ba 16FB 37d8 19B0 A4dc'),
  ).toBeVisible();
  const g0 = page.getByTestId('preview-guardian-0');
  await g0.fill('0x12');
  await expect(g0).not.toHaveAttribute('data-issue');
  await g0.press('Tab');
  await expect(g0).toHaveAttribute('data-issue', 'addrInvalid');
});

test('with the plan check shown, each field carries its sentence and the list names every field', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const items = page.getByTestId('preview-issues').locator('li');
  await expect(items).toHaveText([
    'Heir 3 wallet: This is already in the list.',
    'Guardian 3 wallet: This is not a valid wallet address.',
    'Check in every: Check-ins must be at least 1 minute apart.',
  ]);
  await expect(page.getByTestId('preview-heir-2-account')).toHaveAttribute('data-issue', 'plan');
  await expect(page.getByTestId('preview-heir-2-account-live')).toHaveText('');
});

test('ticking wallet recovery says what the guardians could do, in a polite region that was there before', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const power = page.getByTestId('preview-recovery-power');
  await expect(power).toHaveAttribute('aria-live', 'polite');
  await expect(power).toHaveText(
    'Wallet recovery is on: 2 of 3 guardians acting together can move 100% of the covered assets to any wallet they choose. The owner can stop it only by checking in before the alarm window of 2 minutes ends.',
  );
  await page.getByTestId('preview-recovery').uncheck();
  await expect(power).toHaveText('');
});

test('nothing scrolls sideways at 390 px', async ({ page, state }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, state.siteUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('screens of the editors, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(120_000);
  await open(page, state.siteUrl);
  await captureScreens(page, 'editors', { ready: () => ready(page) });
});
