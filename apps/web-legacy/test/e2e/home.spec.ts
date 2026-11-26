import { ANVIL, expect, test } from './fixtures.ts';

test('the home page links the counts to the Status page and lists my vaults', async ({ page, state, wallet }) => {
  await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  await expect(page.getByTestId('home-drill')).toHaveAttribute('href', '#/create?drill=1');

  // The counts live on the Status page: the home page reads no counters and shows no statistics.
  await expect(page.getByTestId('home-status-link')).toHaveAttribute('href', '#/status');
  await expect(page.getByTestId('home-status-link')).toHaveText('Status');
  await expect(page.getByTestId('counters')).toHaveCount(0);
  await expect(page.getByTestId('stats')).toHaveCount(0);

  await page.getByTestId('connect').click();
  for (const v of [state.seeded.simple, state.seeded.guarded, state.seeded.grace]) {
    await expect(page.getByTestId(`my-vault-${v.toLowerCase()}`)).toBeVisible();
  }
  await expect(page.getByTestId(`my-vault-${state.seeded.grace.toLowerCase()}`)).toHaveAttribute('data-state', 'grace');

  await page.getByTestId('home-status-link').click();
  await expect(page.getByTestId('counters')).toHaveAttribute('data-status', 'ok');
});
