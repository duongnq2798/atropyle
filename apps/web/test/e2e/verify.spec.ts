import { ANVIL, expect, test } from './fixtures.ts';

test('the verify page checks a seeded vault', async ({ page, state }) => {
  await page.goto(`${state.siteUrl}#/v/${state.seeded.guarded}/verify`);
  for (const id of ['factory', 'proxy', 'binding', 'code']) {
    await expect(page.getByTestId(`verify-row-${id}`)).toHaveAttribute('data-state', 'pass');
  }
  await expect(page.getByTestId('verify-row-operators')).toHaveAttribute('data-state', 'unknown');
  await expect(page.getByTestId('verify-row-policy')).toHaveAttribute('data-state', 'unknown');
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'POLICY_UNAVAILABLE');
});

test('the proof page reports that the devnet has no policy circuit', async ({ page, state }) => {
  await page.goto(`${state.siteUrl}#/proof`);
  await page.getByTestId('proof-run').click();
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'POLICY_UNAVAILABLE');
});

test('an address that is not a vault is reported', async ({ page, state }) => {
  await page.goto(`${state.siteUrl}#/v/${ANVIL[8]}/verify`);
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'NOT_VAULT');
});
