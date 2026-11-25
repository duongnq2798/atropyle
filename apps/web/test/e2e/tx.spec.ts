import { stateName } from '@atropyle/sdk';
import type { Locator, Page } from '@playwright/test';
import type { Address } from 'viem';
import { ANVIL, expect, test } from './fixtures.ts';
import { expectAccessibleInBothThemes } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';
import { warp } from './state.ts';

const OWNER = ANVIL[1];
const preview = (siteUrl: string) => new URL('e2e/tx/', siteUrl).href;
const lastCard = (page: Page) => page.locator('[data-preview="receipt-bundle"]').getByTestId('p-receipt-bundle-done');

async function openPreview(page: Page, siteUrl: string): Promise<void> {
  await page.goto(preview(siteUrl));
  await expect(lastCard(page)).toBeVisible();
}

async function openLive(page: Page, siteUrl: string, vault: Address): Promise<Locator> {
  await page.goto(`${preview(siteUrl)}#live=${vault}&as=${OWNER}`);
  const card = page.getByTestId('live-tx');
  await card.getByTestId('live-tx-connect').click();
  const sheet = page.getByRole('dialog', { name: 'Choose a wallet' });
  await sheet.getByRole('button', { name: 'Test Wallet' }).click();
  await expect(sheet).toBeHidden();
  await expect(card.getByTestId('live-tx-send')).toBeEnabled();
  return card;
}

test('every TxCard state passes axe, in vellum and in night', async ({ page, state }) => {
  await openPreview(page, state.siteUrl);
  await expectAccessibleInBothThemes(page, lastCard(page));
});

test('the mirror reads the calldata: every call of a bundle, the danger lines, what cannot be undone', async ({
  page,
  state,
}) => {
  await openPreview(page, state.siteUrl);
  const mirror = page.getByTestId('p-mirror-mirror-0');
  await expect(mirror).toContainText('X Layer (196)');
  await expect(mirror.getByTestId('p-mirror-mirror-0-danger-unlimited')).toBeVisible();
  await expect(page.getByTestId('p-mirror-irreversible-1')).toHaveText('Cannot be undone');
  await expect(page.getByTestId('warning-RECOVERY_POWER').first()).toContainText('2 of 3 guardians');
  // A finite fee approve: the figure and the token's symbol, read from the chain, both in the Ledger voice.
  const fee = page.getByTestId('p-fee-mirror-0');
  await expect(fee.locator('[data-raw="5000000"]')).toHaveText('5USDG');
  await expect(fee.locator('[data-raw="5000000"]')).toHaveCSS('font-family', /^"Atropyle Mono"/);
  await expect(page.getByTestId('p-fee-step-0')).toContainText('Allow the creation fee');
  const bundle = page.getByTestId('p-bundle-mirror-bundle');
  await expect(bundle.getByTestId(/^p-bundle-mirror-\d$/)).toHaveCount(3);
  await expect(bundle.getByTestId('p-bundle-mirror-1-danger-all')).toBeVisible();
  await expect(page.getByTestId('p-vote-irreversible-0')).toBeVisible();
  await expect(page.getByTestId('p-receipt-decided').locator('[data-state]')).toHaveCount(2);
});

test('a check-in goes to the wallet as one wallet_sendCalls bundle, and the receipt shows what the chain recorded', async ({
  page,
  state,
  atro,
  wallet,
}) => {
  const vault = state.seeded.grace;
  const predicted = (await atro.vault(vault).whatIf({ type: 'checkIn' }, { as: OWNER })).effect;
  const w = await wallet({ account: OWNER, sendCalls: true });
  const card = await openLive(page, state.siteUrl, vault);
  await expect(card.getByTestId('live-tx-mirror-bundle')).toBeVisible();
  await expect(card.getByTestId('live-tx-mirror-0')).toContainText('checkIn');
  await card.getByTestId('live-tx-send').click();
  const done = card.getByTestId('live-tx-done');
  await expect(done).toBeVisible();
  await expect(done.getByRole('heading', { name: 'Recorded on chain' })).toBeFocused();
  const methods = w.calls.map((c) => c.method);
  expect(methods).toContain('wallet_sendCalls');
  expect(methods).not.toContain('eth_sendTransaction');

  // One "circuit decided" line per StateChanged that the chain recorded in that transaction, nothing invented.
  const hash = (await done.locator('[data-hash]').first().getAttribute('data-hash'))?.toLowerCase();
  const changes = (await atro.vault(vault).events()).filter(
    (e) => e.name === 'StateChanged' && e.transactionHash.toLowerCase() === hash,
  );
  if (predicted && predicted.from !== predicted.next) expect(changes.length).toBeGreaterThan(0);
  const lines = done.getByTestId('live-tx-decided');
  await expect(lines).toHaveCount(changes.length);
  for (const [i, e] of changes.entries()) {
    const badges = lines.nth(i).locator('[data-state]');
    await expect(badges.nth(0)).toHaveAttribute('data-state', stateName(Number(e.args.from)));
    await expect(badges.nth(1)).toHaveAttribute('data-state', stateName(Number(e.args.to)));
  }
});

test('a wallet without wallet_sendCalls signs the same check-in one transaction at a time', async ({
  page,
  state,
  wallet,
}) => {
  await warp(state, 30);
  const w = await wallet({ account: OWNER });
  const card = await openLive(page, state.siteUrl, state.seeded.simple);
  await expect(card.getByTestId('live-tx-mirror-0')).toBeVisible();
  await expect(card.getByTestId('live-tx-mirror-bundle')).toHaveCount(0);
  await card.getByTestId('live-tx-send').click();
  await expect(card.getByTestId('live-tx-done')).toBeVisible();
  const methods = w.calls.map((c) => c.method);
  expect(methods).toContain('eth_sendTransaction');
  expect(methods).not.toContain('wallet_sendCalls');
});

test('screens of TxCard: the mirror, a bundle, revokes, a vote, unsettled and the receipt', async ({
  page,
  state,
}, info) => {
  test.skip(!shouldCapture(info.project.name), 'screens are taken with SCREENS=1 on the desktop project');
  await openPreview(page, state.siteUrl);
  await captureScreens(page, 'tx-card', { ready: () => expect(lastCard(page)).toBeVisible() });
});
