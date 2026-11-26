import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { expectAccessible, setStoredTheme } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';

const PREVIEWS = ['drill', 'six', 'grace', 'alone', 'released', 'expired', 'live'] as const;
const box = (page: Page, id: string): Locator => page.locator(`[data-preview="${id}"]`).getByTestId('time-machine');
type Said = Window & { said?: string[]; threadChanges?: number; threadMoves?: number };

/**
 * Every preview has computed its frames (`live` read its engine from anvil), and the error preview's ErrorBox has
 * loaded its decoder (until then it is a skeleton with no testid).
 */
async function ready(page: Page): Promise<void> {
  for (const id of PREVIEWS) await expect(box(page, id)).toHaveAttribute('data-engine', 'model');
  await expect(page.locator('[data-preview="error"]').getByTestId('time-machine-error-code')).toBeVisible();
}

async function open(page: Page, siteUrl: string): Promise<void> {
  await page.goto(new URL('e2e/time-machine/', siteUrl).href);
  await ready(page);
}

async function centre(l: Locator): Promise<{ x: number; y: number }> {
  const b = await l.boundingBox();
  if (!b) throw new Error('not laid out');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/**
 * Puts the Drill preview on a scenario: its chip, and the "I check in again" switch on or off. The chips and the
 * switch draw their native inputs out of sight (sr-only), so a press lands on their label; `has` is queried inside
 * the label, so it starts from the page, not from the box.
 */
async function pick(page: Page, chip: 'confirm' | 'recover', back: boolean): Promise<Locator> {
  const drill = box(page, 'drill');
  const radio = `input[type="radio"][value="${chip}"]`;
  if (!(await drill.locator(radio).isChecked())) await drill.locator('label', { has: page.locator(radio) }).click();
  const checkbox = drill.locator('input[type="checkbox"]');
  if ((await checkbox.isChecked()) !== back) {
    await drill.locator('label', { has: page.locator('input[type="checkbox"]') }).click();
  }
  await expect(checkbox).toBeChecked({ checked: back });
  return drill;
}

async function atTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
}

/**
 * The Drill preview on `returns`, at the owner's check-in. Idempotent and language-free (a reload switches the
 * language): captureScreens runs it after every reload.
 */
async function drive(page: Page): Promise<void> {
  await ready(page);
  const drill = await pick(page, 'confirm', true);
  await expect(drill).toHaveAttribute('data-scenario', 'returns');
  await drill.getByTestId('time-machine-moment-4').click();
  await expect(drill).toHaveAttribute('data-state', 'active');
  await atTop(page);
}

/** The Drill preview on `recover`, at the moment the vault passes everything to the new wallet. Idempotent. */
async function driveRecovery(page: Page): Promise<void> {
  await ready(page);
  const drill = await pick(page, 'recover', false);
  await expect(drill).toHaveAttribute('data-scenario', 'recover');
  await drill.getByTestId('time-machine-moment-3').click();
  await expect(drill).toHaveAttribute('data-state', 'releasedRecover');
  await atTop(page);
}

test('every state of the time machine passes axe, in vellum and in night', async ({ page, state }) => {
  await open(page, state.siteUrl);
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    await drive(page);
    await expectAccessible(page);
  }
});

test('the keyboard jumps from moment to moment, and the live region says each one once', async ({ page, state }) => {
  await open(page, state.siteUrl);
  const drill = box(page, 'drill');
  const thumb = drill.getByTestId('time-machine-scrubber-thumb-0');
  const live = drill.getByTestId('time-machine-scrubber-live');
  await expect(live).toHaveText('');
  await live.evaluate((el) => {
    const w = window as Said;
    w.said = [];
    new MutationObserver(() => w.said?.push(el.textContent ?? '')).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await thumb.focus();
  await page.keyboard.press('PageUp');
  await expect(thumb).toHaveAttribute('aria-valuenow', '110');
  await expect(drill).toHaveAttribute('data-state', 'grace');
  await page.keyboard.press('ArrowRight');
  await expect(thumb).toHaveAttribute('aria-valuenow', '115');
  await page.keyboard.press('PageUp');
  await expect(thumb).toHaveAttribute('aria-valuenow', '890');
  await page.keyboard.press('PageDown');
  await expect(thumb).toHaveAttribute('aria-valuenow', '110');
  await page.keyboard.press('Home');
  await expect(thumb).toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('End');
  await expect(thumb).toHaveAttribute('aria-valuenow', '1068');
  await expect(thumb).toHaveAttribute(
    'aria-valuetext',
    'In 18 minutes, 22 November 2026, 08:45 UTC: Released to heirs',
  );
  await expect
    .poll(() => page.evaluate(() => (window as Said).said))
    .toEqual([
      'The alarm goes off: you can still stop it by checking in',
      'The time has come for the vault to pass everything to the heirs',
      'The alarm goes off: you can still stop it by checking in',
      'Where the vault is today',
      'The time has come for the vault to pass everything to the heirs',
    ]);
});

test('a drag that ends near a moment snaps to it', async ({ page, state }) => {
  await open(page, state.siteUrl);
  const drill = box(page, 'drill');
  const thumb = drill.getByTestId('time-machine-scrubber-thumb-0');
  const root = await drill.getByTestId('time-machine-scrubber').boundingBox();
  const t = await thumb.boundingBox();
  if (!root || !t) throw new Error('not laid out');
  const alarm = await centre(drill.locator('[data-moment="1"]'));
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  // 1 % of the track past the alarm: inside the 2 % detent.
  await page.mouse.move(alarm.x + (root.width - t.width) * 0.01, alarm.y, { steps: 8 });
  await page.mouse.up();
  await expect(thumb).toHaveAttribute('aria-valuenow', '110');
  await expect(drill).toHaveAttribute('data-state', 'grace');
});

test('the thumb stands on each moment it stops at, within a pixel', async ({ page, state }) => {
  await open(page, state.siteUrl);
  const drill = box(page, 'drill');
  await drill.getByTestId('time-machine-scrubber-thumb-0').focus();
  for (const i of [1, 2]) {
    await page.keyboard.press('PageUp');
    const dot = await centre(drill.locator('[data-part="scrub-now"]'));
    const mark = await centre(drill.locator(`[data-moment="${i}"]`));
    expect(Math.abs(dot.x - mark.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(dot.y - mark.y)).toBeLessThanOrEqual(1);
  }
});

test('Tab reaches the thumb, and a ring rides its dot (WCAG 2.4.7)', async ({ page, state }) => {
  await open(page, state.siteUrl);
  const drill = box(page, 'drill');
  const thumb = drill.getByTestId('time-machine-scrubber-thumb-0');
  // The chips are one tab stop; under Silent the switch is disabled, so the next stop is the thumb.
  await drill.locator('input[type="radio"]:checked').focus();
  await page.keyboard.press('Tab');
  await expect(thumb).toBeFocused();
  expect(await thumb.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  const ring = async () =>
    thumb.locator('[data-part="scrub-now"]').evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: Number.parseFloat(s.outlineWidth) };
    });
  expect((await ring()).style).not.toBe('none');
  expect((await ring()).width).toBeGreaterThanOrEqual(2);
  // It stays on the dot as the keys move it.
  await page.keyboard.press('PageUp');
  await expect(thumb).toHaveAttribute('aria-valuenow', '110');
  expect((await ring()).style).not.toBe('none');
});

test('the gate says when it opens, under its arch and inside the thread', async ({ page, state }) => {
  await open(page, state.siteUrl);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const drill = box(page, 'drill');
    const label = drill.locator('[data-part="gate-at"]');
    await expect(label).toHaveText('Heirs receive · In 15 minutes');
    const l = await label.boundingBox();
    const arch = await drill.locator('[data-part="arch"]').boundingBox();
    const thread = await drill.getByTestId('time-machine-scrubber').boundingBox();
    if (!l || !arch || !thread) throw new Error('not laid out');
    expect(l.y).toBeGreaterThanOrEqual(arch.y + arch.height);
    expect(l.y + l.height).toBeLessThanOrEqual(thread.y + thread.height);
    expect(l.x).toBeGreaterThanOrEqual(thread.x);
    expect(l.x + l.width).toBeLessThanOrEqual(thread.x + thread.width);
  }
});

test('the skeleton has the height of what replaces it, on a desktop and on a phone', async ({ page, state }) => {
  await open(page, state.siteUrl);
  const height = async (id: string) => (await box(page, id).boundingBox())?.height ?? 0;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    // The open shape against the Drill (chips, three moments); the closed one against the released vault.
    expect(Math.abs((await height('loading')) - (await height('drill')))).toBeLessThanOrEqual(24);
    expect(Math.abs((await height('loading-closed')) - (await height('released')))).toBeLessThanOrEqual(24);
  }
});

test('a drag inside one moment moves the lit window and leaves the thread alone (R18.4)', async ({ page, state }) => {
  await open(page, state.siteUrl);
  const drill = box(page, 'drill');
  const thread = drill.locator('[data-thread]');
  await thread.evaluate((el) => {
    const w = window as Said;
    w.threadChanges = 0;
    w.threadMoves = 0;
    new MutationObserver((records) => {
      w.threadChanges = (w.threadChanges ?? 0) + records.length;
    }).observe(el, { childList: true, subtree: true, attributeFilter: ['data-state', 'd'] });
    // A render of the Thread with a new "now" changes no path and no child: it moves its "now" (a style written by
    // moveTogether) and may change its beat. The reveal boxes are the drag's own, written by setRange.
    new MutationObserver((records) => {
      const own = records.filter((r) => !(r.target instanceof Element && r.target.hasAttribute('data-reveal')));
      w.threadMoves = (w.threadMoves ?? 0) + own.length;
    }).observe(el, { subtree: true, attributeFilter: ['style', 'data-beat'] });
  });
  const outer = thread.locator('[data-reveal="outer"]');
  const before = await outer.evaluate((el) => getComputedStyle(el).transform);
  const root = await drill.getByTestId('time-machine-scrubber').boundingBox();
  const t = await drill.getByTestId('time-machine-scrubber-thumb-0').boundingBox();
  if (!root || !t) throw new Error('not laid out');
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  // 60 of the 1 068 s: before the alarm at 110 and outside its detent.
  await page.mouse.move(t.x + t.width / 2 + ((root.width - t.width) * 60) / 1_068, t.y + t.height / 2, { steps: 6 });
  await expect.poll(() => outer.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
  const quiet = () => page.evaluate(() => [(window as Said).threadChanges, (window as Said).threadMoves]);
  expect(await quiet()).toEqual([0, 0]);
  // A longer move, still in the first moment (80 s: the alarm's detent starts at 110 − 21 s): nothing else moves.
  const mid = await outer.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(t.x + t.width / 2 + ((root.width - t.width) * 80) / 1_068, t.y + t.height / 2, { steps: 10 });
  await expect.poll(() => outer.evaluate((el) => getComputedStyle(el).transform)).not.toBe(mid);
  expect(await quiet()).toEqual([0, 0]);
  await page.mouse.up();
  await expect(drill).toHaveAttribute('data-state', 'active');
});

test('a recovery bends to the new wallet where it releases, and the thumb rides the lit thread up to it', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const drill = await pick(page, 'recover', false);
  const thumb = drill.getByTestId('time-machine-scrubber-thumb-0');
  await thumb.focus();
  // The votes at 1 and 2 s, the release at 122 s, in 1 s steps on 182 s: five seconds before the release.
  await page.keyboard.press('End');
  await page.keyboard.press('PageDown');
  await expect(thumb).toHaveAttribute('aria-valuenow', '122');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await expect(thumb).toHaveAttribute('aria-valuenow', '117');
  await expect(drill).toHaveAttribute('data-state', 'recovery');
  // The recovery draws its gate (its label steps aside for the playhead this close to it).
  await expect(drill.locator('[data-thread] [data-part="gate"]')).toBeVisible();
  const m = await drill.evaluate((el) => {
    const thread = el.querySelector('[data-thread]') as HTMLElement;
    const lit = thread.querySelector('[data-part="lit"]') as SVGPathElement;
    const t = thread.getBoundingClientRect();
    const centre = (sel: string) => {
      const b = (el.querySelector(sel) as HTMLElement).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    };
    const dot = centre('[data-part="scrub-now"]');
    // The lit path's y under the dot, in the view's units (600 by 120, stretched to the box).
    const vx = ((dot.x - t.left) / t.width) * 600;
    let y = Number.NaN;
    for (let s = 0, n = lit.getTotalLength(); s <= n; s += 0.25) {
      const p = lit.getPointAtLength(s);
      if (p.x >= vx) {
        y = p.y;
        break;
      }
    }
    return {
      dotY: dot.y,
      litY: t.top + (y / 120) * t.height,
      gateX: centre('[data-part="gate"]').x,
      ringX: centre('[data-layer="moments"] [data-moment="3"]').x,
    };
  });
  expect(Math.abs(m.dotY - m.litY), JSON.stringify(m)).toBeLessThanOrEqual(1);
  // The gate stands on the release ring.
  expect(Math.abs(m.gateX - m.ringX), JSON.stringify(m)).toBeLessThanOrEqual(1);
});

test('a new scenario never moves the stage: the thread being compared stays put', async ({ page, state }) => {
  await open(page, state.siteUrl);
  const drill = box(page, 'drill');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const tops: Record<string, number> = {};
    for (const [chip, back] of [
      ['silent', false],
      ['confirm', false],
      ['confirm', true],
      ['recover', false],
      ['recover', true],
    ] as const) {
      if (chip === 'silent') await drill.locator('label', { has: page.locator('input[value="silent"]') }).click();
      else await pick(page, chip, back);
      const id = (await drill.getAttribute('data-scenario')) ?? chip;
      const stage = await drill.locator('[data-part="stage"]').boundingBox();
      const outer = await drill.boundingBox();
      if (!stage || !outer) throw new Error('not laid out');
      tops[id] = Math.round((stage.y - outer.y) * 10) / 10;
    }
    expect(Object.keys(tops)).toEqual(['silent', 'confirm', 'returns', 'recover', 'recoverBlocked']);
    expect(new Set(Object.values(tops)).size, `${width}: ${JSON.stringify(tops)}`).toBe(1);
  }
});

test('on a phone every left edge of the box lines up, the stage included', async ({ page, state }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, state.siteUrl);
  const lefts = await box(page, 'drill').evaluate((el) => {
    const text = (node: Element | null) => {
      if (!node) return Number.NaN;
      const r = document.createRange();
      r.selectNodeContents(node);
      return Math.round(r.getBoundingClientRect().left);
    };
    const stage = el.querySelector('[data-part="stage"]') as HTMLElement;
    return {
      title: text(el.querySelector('h2')),
      chips: Math.round((el.querySelector('fieldset label') as HTMLElement).getBoundingClientRect().left),
      badge: Math.round((stage.children[1] as HTMLElement).getBoundingClientRect().left),
      caption: text(stage.querySelector(':scope > p')),
      about: text(stage.nextElementSibling),
      moments: text(el.querySelector('h3')),
    };
  });
  expect(new Set(Object.values(lefts)).size, JSON.stringify(lefts)).toBe(1);
});

test('the live preview computes with the deployment engine it read', async ({ page, state }) => {
  await open(page, state.siteUrl);
  const live = box(page, 'live');
  await expect(live).toHaveAttribute('data-engine', 'model');
  await expect(live.getByTestId('time-machine-moments').getByRole('listitem')).toHaveCount(3);
});

test('nothing scrolls sideways at 390 px', async ({ page, state }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, state.siteUrl);
  await drive(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('screens of the time machine, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(180_000);
  await open(page, state.siteUrl);
  await captureScreens(page, 'time-machine', { ready: () => ready(page) });
  await captureScreens(page, 'time-machine-scrubbed', { ready: () => drive(page) });
  await captureScreens(page, 'time-machine-recovery', { ready: () => driveRecovery(page) });
});
