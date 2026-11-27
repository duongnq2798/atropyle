import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { expectAccessibleInBothThemes, settle } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';

/** The preview has drawn, with its three plan check issues. Idempotent: captureScreens runs it after every reload. */
async function ready(page: Page): Promise<void> {
  await expect(page.getByTestId('preview-shares-thumb-0')).toBeVisible();
  await expect(page.getByTestId('preview-issues')).toHaveAttribute('data-count', '3');
}

async function open(page: Page, siteUrl: string): Promise<void> {
  await page.goto(new URL('e2e/editors/', siteUrl).href);
  await ready(page);
}

/**
 * Ticks or unticks a checkbox drawn as a switch. The native input is out of sight (sr-only), so a press lands on its
 * label, as a person's does (the time machine's pattern).
 */
async function toggle(page: Page, testId: string, on: boolean): Promise<void> {
  const box = page.getByTestId(testId);
  if ((await box.isChecked()) !== on) await page.locator('label', { has: box }).click();
  await expect(box).toBeChecked({ checked: on });
}

test('every editor passes axe, in vellum and in night', async ({ page, state }) => {
  await open(page, state.siteUrl);
  await expectAccessibleInBothThemes(page, page.getByTestId('preview-shares-thumb-0'));
});

test('the share splitter moves 1% per arrow key, stops at 1%, and a typed percent takes from the next heir', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const thumb = page.getByTestId('preview-shares-thumb-0');
  const percent = (i: number) => page.getByTestId(`preview-shares-percent-${i}`);
  await thumb.focus();
  await page.keyboard.press('ArrowRight');
  await expect(percent(0)).toHaveValue('51');
  await expect(thumb).toHaveAttribute('aria-valuetext', 'Heir 1: 51%, Heir 2: 29%');
  await page.keyboard.press('Home');
  await expect(percent(0)).toHaveValue('1');
  await expect(percent(1)).toHaveValue('79');
  // Heir 3 holds 20%: heir 2 can take all of it but its last 1%.
  await percent(1).fill('99');
  await percent(1).press('Tab');
  await expect(percent(1)).toHaveValue('98');
  await expect(percent(2)).toHaveValue('1');
});

test('an address field names the mistake once it holds a whole address, and says it in its live region', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  await toggle(page, 'preview-show-issues', false);
  await expect(page.getByTestId('preview-issues')).toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('preview-heir-2-account')).toHaveAttribute('data-issue', 'addrDuplicate');
  await expect(page.getByTestId('preview-heir-2-account-live')).toHaveText('This address is already in the list.');
  await expect(page.getByTestId('preview-guardian-2')).toHaveAttribute('data-issue', 'addrChecksum');
  // Heir 2 was typed in lowercase: its hint draws it checksummed, as an Address in the Ledger voice.
  const heir2 = page.locator('[data-preview="heirs"] [data-address="0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"]');
  await expect(heir2).toBeVisible();
  await expect(heir2.locator('[data-part="groups"]')).toHaveText('0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc');
  const g0 = page.getByTestId('preview-guardian-0');
  await g0.fill('0x12');
  await expect(g0).not.toHaveAttribute('data-issue');
  await g0.press('Tab');
  await expect(g0).toHaveAttribute('data-issue', 'addrInvalid');
});

test('with the plan check shown, each field carries its sentence and the list names every field', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const items = page.getByTestId('preview-issues').locator('li');
  await expect(items).toHaveText([
    'Heir 3 wallet: This is already in the list.',
    'Guardian 3 wallet: This is not a valid wallet address.',
    'Check in every: Check-ins must be at least 1 minute apart.',
  ]);
  await expect(page.getByTestId('preview-heir-2-account')).toHaveAttribute('data-issue', 'plan');
  await expect(page.getByTestId('preview-heir-2-account-live')).toHaveText('');
});

test('ticking wallet recovery says what the guardians could do, in a polite region that was there before', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const power = page.getByTestId('preview-recovery-power');
  await expect(power).toHaveAttribute('aria-live', 'polite');
  await expect(power).toHaveText(
    'Wallet recovery is on: 2 of 3 guardians acting together can move 100% of the covered assets to any wallet they choose. The owner can stop it only by checking in before the alarm window of 2 minutes ends.',
  );
  await toggle(page, 'preview-recovery', false);
  await expect(power).toHaveText('');
});

test('every checksummed address hint stands as one Ledger block: 0x and five groups, then five under them', async ({
  page,
  state,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, state.siteUrl);
    const blocks = page.locator('[data-preview] [data-address] [data-part="groups"]');
    // Heirs 1, 2 and 3 (3 repeats 1, still an address), guardians 1 and 2; guardian 3's checksum is broken.
    await expect(blocks).toHaveCount(5);
    for (const g of await blocks.all()) {
      const m = await g.evaluate((el) => {
        const boxes = [...el.querySelectorAll(':scope > span')].map((s) => s.getBoundingClientRect());
        const hint = (el.closest('p') as HTMLElement).getBoundingClientRect();
        return {
          family: getComputedStyle(el).fontFamily,
          tops: boxes.map((b) => Math.round(b.top)),
          lefts: boxes.map((b) => b.left),
          // The block starts its own line under the lead sentence, at the hint's left edge.
          start: boxes[0].left - hint.left,
          below: boxes[0].top - hint.top,
        };
      });
      expect(m.family, `at ${width}`).toMatch(/^"?Atropyle Mono"?,/);
      expect(Math.abs(m.start), `at ${width}`).toBeLessThan(0.5);
      expect(m.below, `at ${width}`).toBeGreaterThan(12);
      const rows = [...new Set(m.tops)];
      expect(rows, `at ${width}`).toHaveLength(2);
      expect(
        m.tops.filter((t) => t === rows[0]),
        `at ${width}`,
      ).toHaveLength(6);
      // Row two's five groups stand in the columns of row one's, so two addresses compare group by group.
      for (let i = 0; i < 5; i++) expect(Math.abs(m.lefts[6 + i] - m.lefts[1 + i]), `at ${width}`).toBeLessThan(0.5);
    }
  }
});

test("in night the switch and the radios are the product's own, and the card shows the keyboard focus", async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  await toggle(page, 'preview-recovery', false);
  const recovery = page.getByTestId('preview-recovery');
  const drill = page.getByTestId('preview-preset-drill');
  const custom = page.getByTestId('preview-preset-custom');
  // Chromium draws an unticked native box or radio in night as a filled grey shape that reads as disabled.
  for (const input of [recovery, drill, custom]) {
    const b = await input.boundingBox();
    expect(b?.width ?? 0).toBeLessThanOrEqual(1);
    expect(b?.height ?? 0).toBeLessThanOrEqual(1);
  }
  const drawn = (testId: string) =>
    page.getByTestId(testId).evaluate((el) => {
      const mark = el.nextElementSibling as HTMLElement;
      const card = el.closest('label') as HTMLElement;
      const dot = mark.firstElementChild as HTMLElement;
      const s = getComputedStyle(mark);
      return {
        part: mark.dataset.part,
        fill: s.backgroundColor,
        ring: s.borderTopWidth,
        dot: getComputedStyle(dot).scale,
        markOutline: s.outlineStyle,
        cardOutline: getComputedStyle(card).outlineStyle,
      };
    });
  // The unpicked preset: an empty ring, its dot scaled away.
  await settle(page);
  expect(await drawn('preview-preset-drill')).toMatchObject({
    part: 'radio',
    fill: 'rgba(0, 0, 0, 0)',
    ring: '2px',
    dot: '0',
  });
  expect(await drawn('preview-preset-custom')).toMatchObject({ part: 'radio', dot: '1' });
  // The keyboard reaches the switch, then the picked radio of the group; its arrows pick another.
  await page.getByTestId('preview-k').focus();
  await page.keyboard.press('Tab');
  await expect(recovery).toBeFocused();
  expect((await drawn('preview-recovery')).markOutline).toBe('solid');
  await page.keyboard.press('Space');
  await expect(recovery).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(custom).toBeFocused();
  expect((await drawn('preview-preset-custom')).cardOutline).toBe('solid');
  await page.keyboard.press('ArrowUp');
  await expect(drill).toBeChecked();
  await expect(drill).toBeFocused();
  await settle(page);
  expect(await drawn('preview-preset-drill')).toMatchObject({ dot: '1', cardOutline: 'solid' });
  expect(await drawn('preview-preset-custom')).toMatchObject({ dot: '0', cardOutline: 'none' });
});

test('nothing scrolls sideways at 390 px', async ({ page, state }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, state.siteUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('screens of the editors, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(120_000);
  await open(page, state.siteUrl);
  await captureScreens(page, 'editors', { ready: () => ready(page) });
});

test('screens of the editors with recovery off, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(120_000);
  await open(page, state.siteUrl);
  // The guardians step as it opens in the wizard: recovery off. The Drill preset stays unpicked (custom is).
  const off = async () => {
    await ready(page);
    await toggle(page, 'preview-recovery', false);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  };
  await captureScreens(page, 'editors-off', {
    ready: off,
    shots: [
      { theme: 'dark', lang: 'en', width: 1440 },
      { theme: 'dark', lang: 'en', width: 390 },
    ],
  });
});
