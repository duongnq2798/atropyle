import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import { KEYS } from '../../src/lib/store.ts';

/** WCAG 2.2 AA, the bar of spec §11. */
export const AXE_TAGS: readonly string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The stored theme choices the tests use: `light` is vellum (the default), `dark` is night (spec §18.4.1). */
export type E2ETheme = 'dark' | 'light';
export type E2ELang = 'en' | 'vi';

/**
 * Waits until every animation that can end has ended. Loops (the thread pulse) never end, and an animation on a
 * scroll or view timeline ends only when the page scrolls (Ruling R15): both are let through.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== 'running' ||
            a.timeline !== document.timeline ||
            a.effect?.getComputedTiming().endTime === Number.POSITIVE_INFINITY,
        ),
    undefined,
    { timeout: 10_000 },
  );
}

/** The animations running now, each as `<name> on <tag.class>`, so that a failure says what moves. */
export function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const name =
          a instanceof CSSAnimation
            ? a.animationName
            : a instanceof CSSTransition
              ? `transition:${a.transitionProperty}`
              : a.id || 'scripted';
        const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
        const classes = (target?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3);
        return `${name} on ${target ? [target.tagName.toLowerCase(), ...classes].join('.') : 'nothing'}`;
      }),
  );
}

/** No axe violation at WCAG 2.2 AA, once the page is at rest. */
export async function expectAccessible(page: Page): Promise<void> {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
  expect(violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual(
    [],
  );
}

/**
 * Ruling R18.17: switches the theme the way a person's choice does, through the stored choice and a reload. Neither
 * vellum nor night follows the system preference, so emulateMedia({ colorScheme }) cannot change the theme. The reload restarts
 * the page from its URL: state in the hash or in session storage survives, an open dialog does not.
 */
export async function setStoredTheme(page: Page, theme: E2ETheme): Promise<void> {
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [KEYS.theme, theme] as const);
  await page.reload();
  // The boot script applies the stored choice before the first paint, and always sets the attribute (7C-T12).
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** The language, the same way; it applies after hydration, so this waits for <html lang>. */
export async function setStoredLang(page: Page, lang: E2ELang): Promise<void> {
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [KEYS.lang, lang] as const);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/**
 * No axe violation in vellum, then in night, each set through the stored choice (setStoredTheme); the page ends in
 * night, where the suite starts (fixtures.ts firstTheme). Each theme reloads the page: pass `ready` when the page fills in after load (a vault read from
 * the chain), and use expectAccessible instead while a dialog is open.
 */
export async function expectAccessibleInBothThemes(page: Page, ready?: Locator): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    if (ready) await expect(ready).toBeVisible();
    await expectAccessible(page);
  }
}

/** The settings: the Settings popover on wide screens, the Menu sheet on phones. */
export async function openSettings(page: Page): Promise<Locator> {
  const settings = page.getByRole('button', { name: 'Settings' });
  if (await settings.isVisible()) {
    await settings.click();
    return page.getByRole('dialog', { name: 'Settings' });
  }
  await page.getByRole('button', { name: 'Menu' }).click();
  return page.getByRole('dialog', { name: 'Menu' });
}

/** Connect through the header button and the wallet sheet, as a person would. */
export async function connectWallet(page: Page, name = 'Test Wallet'): Promise<void> {
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose a wallet' });
  await sheet.getByRole('button', { name }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: /^Wallet 0x/ })).toBeVisible();
}
