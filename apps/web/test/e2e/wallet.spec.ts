import { ANVIL, expect, test } from './fixtures.ts';
import { connectWallet, expectAccessible, openSettings } from './helpers.ts';
import { rpcCall } from './state.ts';

/** compactAddress of ANVIL[1] (Task 5). */
const ACCOUNT = 'Wallet 0x7099 7970 … 17dc 79C8';

const REFUSED = [
  ['eth_sendRawTransaction', ['0x02f8']],
  ['personal_sign', ['0x68656c6c6f', ANVIL[1]]],
  ['eth_sign', [ANVIL[1], '0x68656c6c6f']],
  ['eth_signTypedData_v4', [ANVIL[1], '{}']],
  ['eth_signTransaction', [{ from: ANVIL[1], to: ANVIL[2] }]],
] as const;

test('a wallet connects through the sheet, comes back after a reload without a prompt, and disconnects', async ({
  page,
  state,
  wallet,
}) => {
  const w = await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose a wallet' });
  await expect(sheet.getByRole('button', { name: 'Test Wallet' })).toBeVisible();
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Test Wallet' }).click();
  await expect(sheet).toBeHidden();
  const account = page.getByRole('button', { name: ACCOUNT, exact: true });
  await expect(account).toBeVisible();
  expect(w.calls.map((c) => c.method)).toContain('eth_requestAccounts');

  const before = w.calls.length;
  await page.reload();
  await expect(account).toBeVisible();
  // Quyết định 27: a remembered wallet comes back through eth_accounts, never through a prompt.
  expect(w.calls.slice(before).map((c) => c.method)).not.toContain('eth_requestAccounts');

  await account.click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Disconnect' }).click();
  const connect = page.getByRole('button', { name: 'Connect wallet' });
  await expect(connect).toBeVisible();
  await page.reload();
  await expect(connect).toBeVisible();
  await expect(account).toBeHidden();
});

/**
 * Parked T11: one press on Connect right after Escape closed the settings did not open the sheet. The press is a
 * person's (mouse.click or touchscreen.tap at the button), not locator.click, which waits until the closing settings
 * are out of the way.
 */
test('one press on Connect right after Escape closed the settings opens the wallet sheet', async ({
  page,
  state,
  wallet,
}, info) => {
  await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  const connect = page.getByRole('button', { name: 'Connect wallet' });
  await expect(connect).toBeVisible();
  const box = await connect.boundingBox();
  if (box === null) throw new Error('Connect wallet has no box');
  const settings = await openSettings(page);
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  if (info.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  const sheet = page.getByRole('dialog', { name: 'Choose a wallet' });
  await expect(sheet.getByRole('button', { name: 'Test Wallet' })).toBeVisible();
  // The settings finish closing behind the sheet; giving focus back to their button must not close it or take focus.
  await expect(settings).toBeHidden();
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
});

test('a wallet on another chain sees the banner and switches with one press', async ({ page, state, wallet }) => {
  await wallet({ account: ANVIL[1], chainId: 196, knownChains: [31337] });
  await page.goto(state.siteUrl);
  await connectWallet(page);
  const banner = page.getByTestId('network-banner');
  await expect(banner).toContainText('Your wallet is on X Layer. Atropyle runs on Anvil (chain 31337).');
  await expect(page.getByRole('button', { name: `${ACCOUNT}, wrong network` })).toBeVisible();
  await expectAccessible(page);
  await banner.getByRole('button', { name: 'Switch to Anvil' }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByRole('button', { name: ACCOUNT, exact: true })).toBeVisible();
});

test('the wallet refuses signing and raw-transaction methods before anvil sees them', async ({
  page,
  state,
  wallet,
}) => {
  const w = await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  const before = await rpcCall(state.rpcUrl, 'eth_blockNumber');
  const codes = await page.evaluate(async (cases) => {
    const provider = await new Promise<{ request(a: { method: string; params: unknown[] }): Promise<unknown> }>(
      (resolve) => {
        window.addEventListener('eip6963:announceProvider', (e) => resolve((e as CustomEvent).detail.provider), {
          once: true,
        });
        window.dispatchEvent(new Event('eip6963:requestProvider'));
      },
    );
    const out: unknown[] = [];
    for (const [method, params] of cases) {
      out.push(
        await provider.request({ method, params: [...params] }).then(
          () => 'accepted',
          (e: { code?: number }) => e.code,
        ),
      );
    }
    return out;
  }, REFUSED);
  expect(codes).toEqual(REFUSED.map(() => 4200));
  expect(w.calls.map((c) => c.method)).toEqual(REFUSED.map(([m]) => m));
  expect(await rpcCall(state.rpcUrl, 'eth_blockNumber')).toBe(before);
});
