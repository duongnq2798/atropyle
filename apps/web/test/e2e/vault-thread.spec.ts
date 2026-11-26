import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { expectAccessibleInBothThemes } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';

const thread = (page: Page, id: string): Locator => page.locator(`[data-preview="${id}"] [data-thread]`);

async function ready(page: Page): Promise<void> {
  await expect(thread(page, 'none')).toBeVisible();
}

async function open(page: Page, siteUrl: string): Promise<void> {
  await page.goto(new URL('e2e/vault-thread/', siteUrl).href);
  await ready(page);
}

test('every vault thread passes axe, in vellum and in night', async ({ page, state }) => {
  await open(page, state.siteUrl);
  await expectAccessibleInBothThemes(page, thread(page, 'none'));
});

test('each vault draws its own wave, and a thread without a signature draws the one it always drew', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const d = (id: string) => thread(page, id).locator('[data-layer="base"] [data-part="track"]').getAttribute('d');
  const [plain, a, b] = await Promise.all([d('default'), d('vault-a'), d('vault-b')]);
  expect(new Set([plain, a, b]).size).toBe(3);
  await expect(thread(page, 'default')).not.toHaveAttribute('data-signed', 'true');
  for (const id of ['vault-a', 'vault-b', 'grace', 'released', 'five', 'none']) {
    await expect(thread(page, id)).toHaveAttribute('data-signed', 'true');
  }
});

test('the knots and the gate sit on the signed wave, on a desktop and on a phone (R18.4)', async ({ page, state }) => {
  await open(page, state.siteUrl);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ['vault-a', 'vault-b', 'five']) {
      const off = await thread(page, id).evaluate((root) => {
        // The course in the base layer: never inside the RevealWindow, whose boxes carry transforms.
        const track = root.querySelector('[data-layer="base"] [data-part="track"]') as SVGPathElement;
        const t = root.getBoundingClientRect();
        const pts: [number, number][] = [];
        for (let s = 0, n = track.getTotalLength(); s <= n; s += 0.25) {
          const p = track.getPointAtLength(s);
          pts.push([p.x, p.y]);
        }
        const yAt = (vx: number) => (pts.find(([x]) => x >= vx) ?? pts[pts.length - 1])[1];
        return [...root.querySelectorAll<HTMLElement>('[data-part="knot"], [data-part="gate"]')].map((el) => {
          const b = el.getBoundingClientRect();
          const cx = b.left + b.width / 2;
          const cy = b.top + b.height / 2;
          // View units (600 by 120, stretched to the box) back to screen pixels.
          return Math.abs(cy - (t.top + (yAt(((cx - t.left) / t.width) * 600) / 120) * t.height));
        });
      });
      expect(off.length, id).toBe(4);
      for (const px of off) expect(px, `${id} at ${width}`).toBeLessThanOrEqual(1);
    }
  }
});

test("the guardians' posts stand inside the gate: n posts, a bar over k, the confirmed ones lit", async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const want: Record<string, [number, number, number]> = {
    'vault-a': [3, 2, 0],
    'vault-b': [2, 1, 0],
    grace: [3, 2, 1],
    released: [3, 2, 2],
    five: [5, 3, 4],
  };
  for (const [id, [n, k, lit]] of Object.entries(want)) {
    const gate = thread(page, id).locator('[data-part="gate"]');
    const posts = gate.locator('[data-part="posts"]');
    await expect(posts).toHaveAttribute('data-n', String(n));
    await expect(posts).toHaveAttribute('data-k', String(k));
    await expect(posts).toHaveAttribute('data-met', String(lit >= k));
    await expect(posts.locator('[data-part="post"]')).toHaveCount(n);
    await expect(posts.locator('[data-part="post"][data-lit="true"]')).toHaveCount(lit);
    const g = await gate.boundingBox();
    if (!g) throw new Error(`${id}: gate not laid out`);
    for (const box of await posts.locator('[data-part="post"], [data-part="quorum"]').all()) {
      const b = await box.boundingBox();
      if (!b) throw new Error(`${id}: post not laid out`);
      expect(b.x, id).toBeGreaterThanOrEqual(g.x - 0.5);
      expect(b.x + b.width, id).toBeLessThanOrEqual(g.x + g.width + 0.5);
      expect(b.y, id).toBeGreaterThanOrEqual(g.y - 0.5);
      expect(b.y + b.height, id).toBeLessThanOrEqual(g.y + g.height + 0.5);
    }
  }
  await expect(thread(page, 'none').locator('[data-part="posts"]')).toHaveCount(0);
});

test('nothing scrolls sideways at 390 px', async ({ page, state }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, state.siteUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('screens of the vault threads, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(120_000);
  await open(page, state.siteUrl);
  await captureScreens(page, 'vault-thread', { ready: () => ready(page) });
});
