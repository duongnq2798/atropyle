import { ANVIL, expect, test } from './fixtures.ts';
import { OKX_ORIGINS } from './network.ts';

test('the verify page checks a seeded vault', async ({ page, state, requests }) => {
  await page.goto(`${state.siteUrl}#/v/${state.seeded.guarded}/verify`);
  // While the policy proof loads, rows read as unknown and the overall result is pending.
  await expect(page.getByTestId('verify-overall')).not.toHaveAttribute('data-ok', 'pending');
  await expect(page.getByTestId('verify-overall')).toHaveAttribute('data-ok', 'false');
  for (const id of ['factory', 'proxy', 'binding', 'code']) {
    await expect(page.getByTestId(`verify-row-${id}`)).toHaveAttribute('data-state', 'pass');
  }
  await expect(page.getByTestId('verify-row-operators')).toHaveAttribute('data-state', 'unknown');
  await expect(page.getByTestId('verify-row-policy')).toHaveAttribute('data-state', 'unknown');
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'POLICY_UNAVAILABLE');
  // Routed chain reads are recorded, so the off-chain check in the page fixture sees real traffic.
  expect(requests.some((u) => OKX_ORIGINS.includes(new URL(u).origin))).toBe(true);
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
