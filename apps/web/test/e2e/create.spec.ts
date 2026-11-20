import type { Address } from 'viem';
import { ANVIL, expect, test } from './fixtures.ts';

test('create a Drill from the wizard', async ({ page, state, atro, wallet }) => {
  const token = atro.deployment.feeTokens[0];
  await wallet({ account: ANVIL[1] });
  await page.goto(`${state.siteUrl}#/create?drill=1`);
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('wallet-account')).toBeVisible();

  await page.getByTestId('create-next').click();
  await page.getByTestId('create-heir-0-account').fill(ANVIL[2]);
  await page.getByTestId('create-next').click();
  await expect(page.getByTestId('create-preset-drill')).toBeChecked();
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-add-token').click();
  await expect(page.getByTestId('create-asset-0-token')).toHaveValue(token);

  await page.getByTestId('create-check').click();
  await expect(page.getByTestId('create-token-0')).toBeVisible();
  await expect(page.getByTestId('create-warning-DRILL_NOT_FOR_REAL_ASSETS')).toBeVisible();
  await page.getByTestId('create-prepare').click();
  await expect(page.getByTestId('create-tx-step-0')).toHaveAttribute('data-phase', 'ready');
  await page.getByTestId('create-tx-send').click();
  await expect(page.getByTestId('create-tx-done')).toBeVisible();
  await expect(page.getByTestId('create-tx-progress')).toHaveJSProperty('value', 2);

  const link = (await page.getByTestId('create-open-vault').getAttribute('href')) ?? '';
  expect(link).toMatch(/^#\/v\/0x[0-9a-fA-F]{40}$/);
  const vault = link.slice('#/v/'.length) as Address;
  const cfg = await atro.vault(vault).config();
  expect(cfg).toMatchObject({
    owner: ANVIL[1],
    drill: true,
    k: 0,
    heirs: [{ account: ANVIL[2], bps: 10000 }],
    timing: { period: 60, threshold: 2, window: 120 },
  });
  expect(cfg.assets).toEqual([{ kind: 'erc20', token, id: 0n, heir: 0 }]);
  const status = await atro.vault(vault).status();
  expect(status.state).toBe('active');
  expect(status.assets[0].coverage).toBe(status.assets[0].held);
});
