import type { Page } from '@playwright/test';
import { KEYS } from '../../src/lib/store.ts';
import { expect, test } from './fixtures.ts';
import { openSettings } from './helpers.ts';

/** --atro-bg of globals.css: vellum #f6f1e7, night #0b0d12. */
const VELLUM = [246, 241, 231] as const;
const NIGHT = [11, 13, 18] as const;
const css = (c: readonly number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - (b[i] ?? -99)) <= 2);
/** Every page of ROUTES (src/routes.ts) and the 404 page; routes.ts itself imports through the @/ alias. */
const PAGES = [
  '',
  'create/',
  'vault/',
  'verify/',
  'sign/',
  'proof/',
  'me/',
  'join/',
  'alerts/confirm/',
  'alerts/unsubscribe/',
  'status/',
  'developers/',
  'privacy/',
  'no-such-page/',
] as const;

// This file tests the default: storage starts empty, so the suite's night start (fixtures.ts) is off.
test.use({ firstTheme: null });

const noChunks = (url: URL) => url.pathname.endsWith('.js');
const abort = (route: { abort: () => Promise<void> }) => route.abort();

/** The most common colour of a PNG, decoded in a blank page of the same context, which has no CSP. */
async function dominantColour(page: Page, png: Buffer): Promise<number[]> {
  const blank = await page.context().newPage();
  try {
    return await blank.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2D context');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const counts = new Map<number, number>();
      for (let i = 0; i < data.length; i += 4) {
        const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let best = 0;
      let most = -1;
      for (const [key, n] of counts) {
        if (n > most) {
          best = key;
          most = n;
        }
      }
      return [best >> 16, (best >> 8) & 255, best & 255];
    }, png.toString('base64'));
  } finally {
    await blank.close();
  }
}

const shotPath = (project: string, name: string) => `test-results/screens/t12-first-paint/${project}-${name}.png`;

test('with empty storage the first screenshot has the vellum background, whatever the device prefers', async ({
  page,
  state,
}, info) => {
  // No chunk runs: what the browser paints from the static HTML, the stylesheet and the inline boot script alone.
  await page.route(noChunks, abort);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(state.siteUrl);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const shot = await page.screenshot({ path: shotPath(info.project.name, `vellum-empty-${colorScheme}-device`) });
    expect(near(await dominantColour(page, shot), VELLUM), colorScheme).toBe(true);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), KEYS.theme)).toBeNull();
  }
  await page.unroute(noChunks, abort);
});

test('every page paints vellum before any chunk runs, and stays vellum once hydrated, without writing storage', async ({
  page,
  state,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route(noChunks, abort);
  for (const p of PAGES) {
    await page.goto(new URL(p, state.siteUrl).href);
    await expect(page.locator('html'), p || '/').toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), p || '/').toBe(
      css(VELLUM),
    );
  }
  await page.unroute(noChunks, abort);
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const settings = await openSettings(page);
  await expect(settings.getByRole('radio', { name: 'Vellum' })).toBeChecked();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(css(VELLUM));
  expect(await page.evaluate((k) => window.localStorage.getItem(k), KEYS.theme)).toBeNull();
});

test('a stored night choice paints night in the first screenshot', async ({ page, state }, info) => {
  await page.goto(new URL('robots.txt', state.siteUrl).href);
  await page.evaluate((k) => window.localStorage.setItem(k, 'dark'), KEYS.theme);
  await page.route(noChunks, abort);
  await page.goto(state.siteUrl);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const shot = await page.screenshot({ path: shotPath(info.project.name, 'night-stored') });
  expect(near(await dominantColour(page, shot), NIGHT)).toBe(true);
  await page.unroute(noChunks, abort);
});

test('with storage blocked the page is vellum', async ({ page, state }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('storage is disabled', 'SecurityError');
      },
    });
  });
  await page.route(noChunks, abort);
  await page.goto(state.siteUrl);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(css(VELLUM));
  await page.unroute(noChunks, abort);
});
