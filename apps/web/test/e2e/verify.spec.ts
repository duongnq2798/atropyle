import { getDeployment, VERSION } from '@atropyle/sdk';
import type { Page } from '@playwright/test';
import { ANVIL, expect, test } from './fixtures.ts';
import { expectAccessibleInBothThemes } from './helpers.ts';
import { OKX_ORIGINS } from './network.ts';
import { captureScreens, SCREEN_MATRIX, shouldCapture, VELLUM_MATRIX } from './screens.ts';

const X = getDeployment('xlayer');
/** The same values as src/app/e2e/verify/page.e2e.tsx. */
const VAULT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const BLOCK = '46200000';

/** The overall answer once it is no longer pending. */
const answered = (page: Page) => page.locator('[data-testid="verify-overall"]:not([data-ok="pending"])');

test('the vault page leads to a check of the vault in three plain lines', async ({ page, state, requests }) => {
  const vault = state.seeded.guarded;
  await page.goto(`${state.siteUrl}vault/#${vault}`);
  await page.getByTestId('vault-verify').click();
  await expect(page).toHaveURL(new RegExp(`/verify/#${vault}$`));
  // No policy circuit, and one RPC operator asked: "not checked", never "no", and never a failure.
  await expect(page.getByTestId('verify-overall')).toHaveAttribute('data-overall', 'partial');
  await expect(page.getByTestId('verify-overall')).toHaveAttribute('data-ok', 'false');
  await expect(page.getByTestId('verify-line-real')).toHaveAttribute('data-state', 'pass');
  await expect(page.getByTestId('verify-line-rules')).toHaveAttribute('data-state', 'unknown');
  await expect(page.getByTestId('verify-line-operators')).toHaveAttribute('data-state', 'unknown');
  // The e2e build lists two quorum groups (global-setup.ts: OKX, then dRPC) and the deweb target asks only OKX while
  // the cross-check is off: the hint says where to turn it on. Not clicked: /status/ is a 404 on this branch (R12).
  const hint = page.getByTestId('verify-line-operators-hint');
  await expect(hint).toContainText('Turn on the cross-check on the Status page');
  await expect(hint.locator('a')).toHaveAttribute('href', '/status/');
  // The devnet has no explorer: no line offers a link it could not keep.
  await expect(page.locator('[data-testid^="verify-line-"][data-testid$="-link"]')).toHaveCount(0);
  for (const id of ['factory', 'proxy', 'binding', 'code']) {
    await expect(page.getByTestId(`verify-row-${id}`)).toHaveAttribute('data-state', 'pass');
  }
  await expect(page.getByTestId('verify-row-policy')).toHaveAttribute('data-state', 'unknown');
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'POLICY_UNAVAILABLE');
  await expect(page.getByTestId('verify-cli')).toHaveText(`npx -y atropyle@${VERSION} verify --vault ${vault}`);
  await expect(page.getByTestId('verify-next')).toHaveCount(0);
  await expect(page.getByTestId('verify-open-vault')).toHaveAttribute('href', `/vault/#${vault}`);
  // Routed chain reads are recorded, so the off-chain check in the page fixture sees real traffic.
  expect(requests.some((u) => OKX_ORIGINS.includes(new URL(u).origin))).toBe(true);
  await page.getByTestId('verify-details').locator('summary').click();
  await expect(page.getByTestId('verify-row-factory')).toBeVisible();
  await expectAccessibleInBothThemes(page, answered(page));
});

test('an address that is not a vault is reported', async ({ page, state }) => {
  await page.goto(`${state.siteUrl}verify/#${ANVIL[8]}`);
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'NOT_VAULT');
});

test('a page without an address asks for one, keeps what was wrong, and checks what is typed', async ({
  page,
  state,
}) => {
  await page.goto(`${state.siteUrl}verify/`);
  await expect(page.getByTestId('verify-missing')).toContainText(
    'Paste the vault address from your letter or invitation.',
  );
  await page.goto(`${state.siteUrl}verify/#not-an-address`);
  await expect(page.getByTestId('verify-open-input')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('verify-open-input')).toHaveValue('not-an-address');
  await page.getByTestId('verify-open-input').fill(state.seeded.simple);
  await page.getByTestId('verify-open').click();
  await expect(page).toHaveURL(new RegExp(`/verify/#${state.seeded.simple}$`));
  await expect(page.getByTestId('verify-line-real')).toHaveAttribute('data-state', 'pass');
});

test('a verified vault reads green, with a link to check each line and the next step', async ({ page, state }) => {
  await page.goto(new URL('e2e/verify/#pass', state.siteUrl).href);
  const overall = page.getByTestId('verify-overall');
  await expect(overall).toHaveAttribute('data-overall', 'pass');
  for (const id of ['real', 'rules', 'operators']) {
    await expect(page.getByTestId(`verify-line-${id}`)).toHaveAttribute('data-state', 'pass');
  }
  const href = (id: string) => page.getByTestId(`verify-line-${id}-link`).locator('a');
  await expect(href('real')).toHaveAttribute('href', `${X.explorerUrl}/address/${VAULT}`);
  await expect(href('rules')).toHaveAttribute('href', `${X.explorerUrl}/address/${X.cpu}`);
  await expect(href('operators')).toHaveAttribute('href', `${X.explorerUrl}/block/${BLOCK}`);
  await expect(page.getByTestId('verify-proof-P9')).toHaveAttribute('data-ok', 'true');
  await expect(page.getByTestId('verify-proof-code')).toHaveAttribute('data-ok', 'true');
  await expect(page.getByTestId('verify-cli')).toHaveText(
    `npx -y atropyle@${VERSION} verify --vault ${VAULT} --p9-seed 20261125`,
  );
  await expect(page.getByTestId('verify-next')).toHaveAttribute('href', `/vault/#${VAULT}`);
  await expect(page.getByTestId('verify-open-vault')).toHaveCount(0);
  // At 390 px the address and the command wrap inside their boxes: nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectAccessibleInBothThemes(page, page.locator('[data-overall="pass"]'));
});

test('while the proof runs the rules line is checking, and a failed row is red at once', async ({ page, state }) => {
  await page.goto(new URL('e2e/verify/#running', state.siteUrl).href);
  await expect(page.getByTestId('verify-overall')).toHaveAttribute('data-overall', 'pending');
  await expect(page.getByTestId('verify-line-rules')).toHaveAttribute('data-state', 'checking');
  await expect(page.getByTestId('verify-progress')).toHaveAttribute('value', String(2 ** 20));
  await expect(page.getByTestId('verify-overall').getByRole('alert')).toHaveCount(0);

  await page.goto(new URL('e2e/verify/#fail', state.siteUrl).href);
  await expect(page.getByTestId('verify-overall')).toHaveAttribute('data-overall', 'fail');
  await expect(page.getByTestId('verify-overall').getByRole('alert')).toHaveCount(1);
  await expect(page.getByTestId('verify-line-real')).toHaveAttribute('data-state', 'fail');
  await expect(page.getByTestId('verify-line-rules')).toHaveAttribute('data-state', 'checking');
  await expect(page.getByTestId('verify-next')).toHaveCount(0);
  await expect(page.getByTestId('verify-open-vault')).toHaveCount(0);
  await page.getByTestId('verify-details').locator('summary').click();
  await expect(page.getByTestId('verify-row-proxy')).toHaveAttribute('data-state', 'fail');
});

test('screens: verify', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'SCREENS=1 only');
  const at = (overall: string) => () =>
    expect(page.getByTestId('verify-overall')).toHaveAttribute('data-overall', overall);
  const phones = VELLUM_MATRIX.filter((s) => s.width === 390);

  await page.goto(new URL('e2e/verify/#pass', state.siteUrl).href);
  await captureScreens(page, 'verify-pass', { shots: [...VELLUM_MATRIX, SCREEN_MATRIX[0]], ready: at('pass') });
  await captureScreens(page, 'verify-pass-details', {
    shots: phones.filter((s) => s.lang === 'en'),
    ready: async () => {
      await at('pass')();
      const details = page.getByTestId('verify-details');
      if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator('summary').click();
    },
  });
  await page.goto(new URL('e2e/verify/#running', state.siteUrl).href);
  await captureScreens(page, 'verify-running', { shots: phones, ready: at('pending') });
  await page.goto(new URL('e2e/verify/#fail', state.siteUrl).href);
  await captureScreens(page, 'verify-fail', { shots: VELLUM_MATRIX, ready: at('fail') });
  await page.goto(`${state.siteUrl}verify/#${state.seeded.guarded}`);
  await captureScreens(page, 'verify-devnet', { shots: VELLUM_MATRIX, ready: at('partial') });
  await page.goto(`${state.siteUrl}verify/`);
  await captureScreens(page, 'verify-missing', {
    shots: phones,
    ready: () => expect(page.getByTestId('verify-missing')).toBeVisible(),
  });
});
