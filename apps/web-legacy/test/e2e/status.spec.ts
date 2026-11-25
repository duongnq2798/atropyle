import { ANVIL, expect, test } from './fixtures.ts';

test('the status page checks the chain and copies diagnostics without the wallet address', async ({
  page,
  state,
  wallet,
}) => {
  const origin = new URL(state.siteUrl).origin;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await wallet({ account: ANVIL[1] });
  await page.goto(`${state.siteUrl}#/status`);
  await page.getByTestId('connect').click();

  await expect(page.getByTestId('status-integrity')).toHaveAttribute('data-ok', 'true');
  // The DeWEB build verifies through the OKX group only (plan decision 4).
  await expect(page.getByTestId('status-warning-SINGLE_RPC')).toBeVisible();
  await expect(page.getByTestId('status-rpc-0')).toHaveAttribute('data-ok', 'true');
  await expect(page.getByTestId('status-rpc-1')).toHaveAttribute('data-ok', 'true');
  await expect(page.getByTestId('status-worker-off')).toBeVisible();
  await expect(page.getByTestId('status-crosscheck')).not.toBeChecked();
  await expect(page.getByTestId('status-crosscheck-warning')).toContainText('100% on-chain');

  const box = page.getByTestId('status-diagnostics');
  await page.getByText('Show what will be copied').click();
  await expect(box).toContainText('Test Wallet');
  const text = (await box.textContent()) ?? '';
  expect(JSON.parse(text)).toMatchObject({
    target: 'deweb',
    page: state.siteUrl,
    chainId: 31337,
    crossCheck: false,
    lang: 'en',
  });
  expect(text.toLowerCase()).not.toContain(ANVIL[1].toLowerCase());
  expect(text).not.toContain('#');

  await page.getByTestId('status-copy').click();
  await expect(page.getByTestId('status-copy')).toHaveText('Copied');
  // Windows clipboards hand the text back with CRLF line ends.
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replaceAll('\u{D}\u{A}', '\u{A}')).toBe(text);
});
