import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.ts';

/**
 * Opens the wallet sheet from a button on the page (a TxCard's Connect, a guest invitation's) and picks the wallet.
 * The header's "Connect wallet" has the same name as a card's, so connectWallet of helpers.ts would meet two buttons.
 * Done when the sheet is gone and the button that opened it too: the card puts Send in its place.
 */
export async function connectFrom(page: Page, trigger: Locator, name = 'Test Wallet'): Promise<void> {
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: 'Choose a wallet' });
  await sheet.getByRole('button', { name }).click();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeHidden();
}

/** Disconnects through the wallet menu of the header (its button reads "Wallet 0x…", on a phone too). */
export async function disconnect(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wallet 0x/ }).click();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: /^Wallet 0x/ })).toHaveCount(0);
}

/** The same characters with the first letter in the other case: a checksummed address becomes an invalid one. */
export function flipCase(address: string): string {
  const i = address.slice(2).search(/[a-fA-F]/) + 2;
  const c = address[i];
  return address.slice(0, i) + (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()) + address.slice(i + 1);
}
