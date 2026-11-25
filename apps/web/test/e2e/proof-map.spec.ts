import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { expectAccessibleInBothThemes, openSettings } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';

/** 1 400 000 blocks: 87 500 dots per region, the upper square of each region and part of the lower one. */
const AT = 1_400_000;
const PAINTED = String(8 * Math.floor(AT / 16));
/** The vellum alive token of globals.css: a theme change must reach the canvas, not only the page. */
const VELLUM_ALIVE = [0x10, 0x6f, 0x5a, 255];

const harness = (siteUrl: string, hash: string) => new URL(`e2e/proof-map/${hash}`, siteUrl).href;
const live = (page: Page) => page.getByTestId('live-map').getByTestId('proof-canvas');
const fresh = (page: Page) => page.getByTestId('fresh-map').getByTestId('proof-canvas');
const run = (page: Page) => page.getByTestId('proof-run');

/** One pixel of a map, as the page reads it back: [r, g, b, a]. */
function pixel(map: Locator, x: number, y: number): Promise<number[]> {
  return map.evaluate(
    (c: HTMLCanvasElement, [px, py]) => [...c.getContext('2d')!.getImageData(px, py, 1, 1).data],
    [x, y],
  );
}

/** A theme colour as the canvas itself computes it (a hex token of globals.css), as [r, g, b, 255]. */
function token(map: Locator, name: string): Promise<number[]> {
  return map.evaluate((c, n) => {
    const hex = getComputedStyle(c).getPropertyValue(`--atro-${n}`).trim();
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`--atro-${n} is "${hex}", not a hex colour`);
    const v = Number.parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
  }, name);
}

/** Pixels where the two maps differ; -1 when one is missing or their sizes differ. */
function difference(page: Page): Promise<number> {
  return page.evaluate(() => {
    const read = (id: string) => {
      const c = document.querySelector<HTMLCanvasElement>(`[data-testid="${id}"] canvas`);
      return c ? c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data : null;
    };
    const a = read('live-map');
    const b = read('fresh-map');
    if (!a || !b || a.length !== b.length) return -1;
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n += 1;
    }
    return n;
  });
}

/** The first dot of each kind of region, and the last dot of state 0, which 1 400 000 blocks do not reach. */
const PROBES = [
  [0, 0, 'alive'],
  [256, 0, 'grace'],
  [512, 0, 'line-strong'],
  [768, 0, 'recovery'],
  [256, 512, 'release'],
  [255, 511, 'surface-3'],
] as const;

/** Each probe pixel is its token, as the canvas computes it now. */
async function expectTokens(map: Locator): Promise<void> {
  for (const [x, y, name] of PROBES) {
    expect(await pixel(map, x, y), `${name} at ${x},${y}`).toEqual(await token(map, name));
  }
}

test('the map painted tick by tick is the map painted in one go, in the theme colours', async ({ page, state }) => {
  await page.goto(harness(state.siteUrl, `#run=${AT}`));
  // The prerendered page is 'idle' (it has no hash), so 'done' means the run has ended.
  await expect(run(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  const map = live(page);
  await expect(map).toHaveAttribute('data-size', '1024');
  await expect(map).toHaveAttribute('data-done', String(AT));
  await expect(map).toHaveAttribute('data-painted', PAINTED);
  await expect(map).toHaveAttribute('data-palette', 'dark');
  // One map from the base, then only new dots: a tick that repainted from the base would raise the generation.
  await expect(map).toHaveAttribute('data-generation', '1');
  expect(Number(await map.getAttribute('data-ticks'))).toBeGreaterThan(20);
  await expect(fresh(page)).toHaveAttribute('data-ticks', '1');
  expect(await difference(page)).toBe(0);
  await expectTokens(map);
});

test('a theme change during the run repaints the map in vellum and keeps its progress', async ({ page, state }) => {
  await page.goto(harness(state.siteUrl, `#run=${AT}`));
  const map = live(page);
  // Hydrated and painting: a click before hydration would be lost.
  await expect(map).toHaveAttribute('data-painted', /^[1-9]/);
  const settings = await openSettings(page);
  await settings.getByText('Vellum', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Whether the run was still going (the usual case) or had just ended, the end is the same.
  await expect(run(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(map).toHaveAttribute('data-palette', 'light');
  await expect(map).toHaveAttribute('data-generation', '2');
  await expect(map).toHaveAttribute('data-painted', PAINTED);
  expect(await difference(page)).toBe(0);
  expect(await pixel(map, 0, 0)).toEqual(VELLUM_ALIVE);
  await expectTokens(map);
  // A page that loads in vellum paints in vellum: the boot script sets the theme before the map reads its colours.
  await page.reload();
  // The run starts again from 0 after the reload: wait for its end and its paint, not for the hydration render.
  await expect(run(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(map).toHaveAttribute('data-painted', PAINTED);
  await expect(map).toHaveAttribute('data-palette', 'light');
  expect(await pixel(map, 0, 0)).toEqual(VELLUM_ALIVE);
});

/** The hairline on the right of region 0, as the browser computes it. */
function hairline(page: Page): Promise<string> {
  return page
    .getByTestId('live-map')
    .locator('[data-region="0"]')
    .evaluate((el) => getComputedStyle(el).borderRightColor);
}

/**
 * 1 600 000 blocks: 100 000 dots per region, past 98 304 (three quarters), where the dots enter the bottom band of
 * each region and the key gives way. AT, two thirds of the run, is short of it.
 */
const PAST_KEY = 1_600_000;
/** The whole proof, 2^21 blocks. */
const FULL = 2 ** 21;

/** Pixels of the map under the glyph's box that are not `base`: a count, so a failure prints one number. */
async function paintedUnder(map: Locator, glyph: Locator, base: number[]): Promise<number> {
  const box = await glyph.boundingBox();
  if (!box) throw new Error('the glyph is not laid out');
  return map.evaluate(
    (canvas: HTMLCanvasElement, [r, b]) => {
      // Both boxes are in CSS pixels of the viewport; the canvas holds `width` dots across its box.
      const m = canvas.getBoundingClientRect();
      const k = canvas.width / m.width;
      const x = Math.floor((r.x - m.left) * k);
      const y = Math.floor((r.y - m.top) * k);
      const data = canvas.getContext('2d')!.getImageData(x, y, Math.ceil(r.width * k), Math.ceil(r.height * k)).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== b[0] || data[i + 1] !== b[1] || data[i + 2] !== b[2] || data[i + 3] !== b[3]) n += 1;
      }
      return n;
    },
    [box, base] as const,
  );
}

function setHash(page: Page, hash: string): Promise<void> {
  return page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}

async function expectKey(glyphs: Locator, opacity: '0' | '1'): Promise<void> {
  for (const g of await glyphs.all()) await expect(g).toHaveCSS('opacity', opacity);
}

test('the map keys its eight codes until the dots reach the bottom band, and the key comes back for a new run', async ({
  page,
  state,
}) => {
  await page.goto(harness(state.siteUrl, '#at=0'));
  const map = live(page);
  // Hydrated: the canvas carries data-painted only once the layout effect has run.
  await expect(map).toHaveAttribute('data-painted', '0');
  await expect(map).toHaveAttribute('data-key', 'on');
  const glyphs = page.getByTestId('live-map').locator('[data-glyph]');
  await expect(glyphs).toHaveCount(8);
  await expectKey(glyphs, '1');
  const idle = await hairline(page);
  // Two thirds of the run: the colours and the key are on screen together, and no glyph covers a painted dot.
  await setHash(page, `#at=${AT}`);
  await expect(map).toHaveAttribute('data-painted', PAINTED);
  await expect(map).toHaveAttribute('data-key', 'on');
  await expectKey(glyphs, '1');
  await expect.poll(() => hairline(page)).not.toBe(idle);
  const base = await token(map, 'surface-3');
  const all = await glyphs.all();
  for (const [s, g] of all.entries()) expect(await paintedUnder(map, g, base), `under region ${s}`).toBe(0);
  // Past three quarters the dots enter the bottom band, where the key sits: it gives way.
  await setHash(page, `#at=${PAST_KEY}`);
  await expect(map).toHaveAttribute('data-painted', String(8 * Math.floor(PAST_KEY / 16)));
  await expect(map).toHaveAttribute('data-key', 'off');
  await expectKey(glyphs, '0');
  // The probe reads the dots under each glyph: at the end of the run they are all painted.
  await setHash(page, `#at=${FULL}`);
  await expect(map).toHaveAttribute('data-painted', String(8 * (FULL / 16)));
  for (const [s, g] of all.entries()) expect(await paintedUnder(map, g, base), `under region ${s}`).toBeGreaterThan(0);
  // A run that starts over shows the key again.
  await setHash(page, '#at=0');
  await expect(map).toHaveAttribute('data-painted', '0');
  await expect(map).toHaveAttribute('data-key', 'on');
  await expectKey(glyphs, '1');
  await expect.poll(() => hairline(page)).toBe(idle);
});

test('a map mid-run passes axe in both themes', async ({ page, state }) => {
  await page.goto(harness(state.siteUrl, `#at=${AT}`));
  await expectAccessibleInBothThemes(page, page.getByRole('img', { name: 'Proof map, painted tick by tick' }));
});

test('screens of the proof map, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(300_000);
  await page.goto(harness(state.siteUrl, `#at=${AT}`));
  await expect(live(page)).toHaveAttribute('data-painted', PAINTED);
  // Every shot reloads the page: wait for the paint after hydration, not only for the prerendered empty map.
  await captureScreens(page, 'proof-map', {
    ready: (p) => expect(live(p)).toHaveAttribute('data-painted', PAINTED),
  });
  // The first frame of /proof/ (the proof runs only on click) and its whole no-JS frame: the idle map and its key.
  // In vellum too, where an empty map has the least contrast to give.
  await page.goto(harness(state.siteUrl, '#at=0'));
  await captureScreens(page, 'proof-map-idle', {
    vellum: true,
    ready: (p) => expect(live(p)).toHaveAttribute('data-painted', '0'),
  });
});
