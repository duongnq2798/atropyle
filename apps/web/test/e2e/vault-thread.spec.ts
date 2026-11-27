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

test('the posts read as guardians at the gate on a phone and a desktop: standing or not yet, apart, under a lintel', async ({
  page,
  state,
}) => {
  await open(page, state.siteUrl);
  const measure = (id: string) =>
    thread(page, id).evaluate((root) => {
      const rect = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
      };
      const stand = root.querySelector('[data-part="posts"]');
      const bar = root.querySelector('[data-part="quorum"]');
      return {
        box: rect(root.querySelector('[data-layer="marks"]') as Element),
        gate: rect(root.querySelector('[data-part="gate"]') as Element),
        wall: Number.parseFloat(getComputedStyle(root.querySelector('[data-part="arch"]') as Element).borderLeftWidth),
        stand: stand ? rect(stand) : null,
        k: Number((stand as HTMLElement | null)?.dataset.k),
        posts: [...root.querySelectorAll<HTMLElement>('[data-part="post"]')].map((p) => ({
          ...rect(p),
          lit: p.dataset.lit === 'true',
        })),
        bar: bar ? rect(bar) : null,
      };
    });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ['vault-a', 'vault-b', 'grace', 'released', 'five']) {
      const m = await measure(id);
      const at = `${id} at ${width}`;
      if (!m.stand || !m.bar) throw new Error(`${at}: no posts or no bar`);
      // A floor of 48 px on a gate with posts: on a phone five posts are 1.5 px wide with 1.9 px between them.
      expect(m.gate.height, at).toBeGreaterThanOrEqual(47.5);
      const standing = m.stand.height;
      expect(standing, at).toBeGreaterThanOrEqual(14);
      for (const p of m.posts) {
        expect(p.width, at).toBeGreaterThanOrEqual(1.5);
        if (p.lit) expect(p.height, `${at}: a lit post stands`).toBeCloseTo(standing, 0);
        else {
          // Not only grey but short: a guardian who has not confirmed is not standing yet (§4.1, never colour alone).
          expect(p.height, `${at}: an unlit post is a stub`).toBeLessThanOrEqual(0.5 * standing);
          expect(p.height, `${at}: a stub is still a post, not a dot`).toBeGreaterThanOrEqual(2 * p.width);
        }
      }
      // Every gap wider than a post, the walls of the arch included: never slats, never a post fused to a wall.
      const gaps = [
        m.posts[0].left - (m.gate.left + m.wall),
        ...m.posts.slice(1).map((p, i) => p.left - m.posts[i].right),
        m.gate.right - m.wall - m.posts[m.posts.length - 1].right,
      ];
      for (const gap of gaps) expect(gap, `${at}: gaps ${gaps.join(', ')}`).toBeGreaterThanOrEqual(m.posts[0].width);
      // The quorum bar is a lintel at standing height, 3 px clear: over stubs it floats, on standing posts it is a Π.
      expect(m.stand.top - m.bar.bottom, at).toBeGreaterThanOrEqual(2.5);
      for (const p of m.posts.filter((q) => q.lit)) expect(p.top - m.bar.bottom, at).toBeGreaterThanOrEqual(2.5);
      // Over one post too it is a bar, not a dot: past the first and the k-th post, and short of post k + 1.
      const kth = m.posts[m.k - 1];
      expect(m.posts[0].left - m.bar.left, at).toBeGreaterThan(0.25);
      expect(m.bar.right - kth.right, at).toBeGreaterThan(0.25);
      if (m.k < m.posts.length) expect(m.posts[m.k].left - m.bar.right, at).toBeGreaterThan(m.bar.right - kth.right);
    }
    const none = await measure('none');
    expect(none.gate.height / none.box.height, `none at ${width}`).toBeCloseTo(0.42, 2);
  }
  // In a box too low for the floor, the gate with posts still stands inside it, arch and all.
  await page.setViewportSize({ width: 390, height: 900 });
  await thread(page, 'five').evaluate((root) => {
    (root as HTMLElement).style.width = '200px';
  });
  const small = await measure('five');
  expect(small.gate.top).toBeGreaterThanOrEqual(small.box.top - 0.5);
  expect(small.gate.bottom).toBeLessThanOrEqual(small.box.bottom + 0.5);
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
  // Vellum too: there the lit post (thread) and an unlit one (line-strong) are nearly one brown, so only shape tells.
  await captureScreens(page, 'vault-thread', { vellum: true, ready: () => ready(page) });
});
