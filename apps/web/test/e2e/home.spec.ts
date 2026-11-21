import { ANVIL, expect, test } from './fixtures.ts';

test('the home page counts vaults from the chain and lists my vaults', async ({ page, state, atro, wallet }) => {
  const expected = await atro.stats();
  await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  await expect(page.getByTestId('home-drill')).toHaveAttribute('href', '#/create?drill=1');

  await page.getByTestId('stats-load').click();
  await expect(page.getByTestId('stat-vaults')).toHaveAttribute('data-value', String(expected.vaults.total));
  await expect(page.getByTestId('stat-drill')).toHaveAttribute('data-value', String(expected.vaults.drill));
  await expect(page.getByTestId('stats-load')).toHaveText('Update from the chain');

  await page.getByTestId('connect').click();
  for (const v of [state.seeded.simple, state.seeded.guarded, state.seeded.grace]) {
    await expect(page.getByTestId(`my-vault-${v.toLowerCase()}`)).toBeVisible();
  }
  await expect(page.getByTestId(`my-vault-${state.seeded.grace.toLowerCase()}`)).toHaveAttribute('data-state', 'grace');
});
