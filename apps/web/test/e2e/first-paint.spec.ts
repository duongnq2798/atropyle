import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/**
 * Spec §18.2 rule 6, and 7B-P1: the pages that read their fragment after mount (/vault/, /sign/, /verify/) paint
 * their final layout first. Lighthouse measured the footer moving when they mounted (CLS 0.271 on /vault/, 0.036 on
 * /sign/, 0.0035 on /verify/). The CPU is slowed, as Lighthouse slows it, so that the static HTML paints well before
 * the page mounts: on a fast machine the two could land in one frame and hide a shift.
 */
interface Shift {
  value: number;
  /** What moved, for the failure message: each node's tag, test id or class, and its rectangles. */
  sources: string[];
}

async function layoutShiftOnLoad(page: Page, url: string): Promise<Shift> {
  // A first visit puts the fonts in the cache. A cold visit at desktop width also moves the header's links when the
  // display faces swap in (the wordmark and the links change width): that is the shell's, on every page, and not what
  // this test guards (7B-P1 Ruling). The measured visit is the second one.
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  try {
    await page.addInitScript(() => {
      type Source = { node?: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly };
      type Entry = PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Source[] };
      const w = window as unknown as { __shift: { value: number; sources: string[] } };
      w.__shift = { value: 0, sources: [] };
      const name = (n?: Node | null) => {
        if (!(n instanceof Element)) return n?.nodeName ?? '?';
        const id = n.getAttribute('data-testid');
        return `${n.tagName.toLowerCase()}${id ? `[${id}]` : `.${String(n.className).split(' ').slice(0, 3).join('.')}`}`;
      };
      const rect = (r: DOMRectReadOnly) =>
        `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Entry[]) {
          if (e.hadRecentInput) continue;
          w.__shift.value += e.value;
          for (const s of e.sources ?? []) {
            w.__shift.sources.push(`${name(s.node)}: ${rect(s.previousRect)} -> ${rect(s.currentRect)}`);
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(url, { waitUntil: 'load' });
    // Mounted: the empty state's wrapper drops the classes that only the static HTML needs (first-paint.tsx).
    await expect(page.locator('[data-first-paint="empty"]')).toHaveClass('contents');
    // Two more frames and a pause: a shift caused by the mount is recorded by then.
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 500)))),
    );
    return await page.evaluate(() => (window as unknown as { __shift: Shift }).__shift);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
  }
}

/** The page's script chunks; its stylesheet and fonts still load. */
const noChunks = (url: URL) => url.pathname.endsWith('.js');

for (const path of ['vault/', 'sign/', 'verify/']) {
  test(`/${path} with nothing in its fragment does not move while it loads`, async ({ page, state }) => {
    const shift = await layoutShiftOnLoad(page, new URL(path, state.siteUrl).href);
    expect(shift.value, `layout shift of /${path}: ${shift.sources.join('; ')}`).toBe(0);
  });
}

test('/vault/ shows its empty state from the static HTML: the first paint is the final one', async ({
  page,
  state,
}) => {
  // Before any script of the page runs (its chunks never come), the reader sees the empty state, not the skeleton.
  await page.route(noChunks, (route) => route.abort());
  await page.goto(new URL('vault/', state.siteUrl).href);
  await expect(page.getByRole('heading', { level: 1, name: 'Open a vault' })).toBeVisible();
  await expect(page.getByTestId('vault-open-input')).toBeVisible();
  await expect(page.getByTestId('vault-loading')).toBeHidden();
});

test('/vault/#<address> shows the skeleton from the static HTML, never the empty state', async ({ page, state }) => {
  await page.route(noChunks, (route) => route.abort());
  await page.goto(`${state.siteUrl}vault/#${state.seeded.simple}`);
  await expect(page.getByTestId('vault-loading')).toBeVisible();
  await expect(page.getByTestId('vault-missing')).toBeHidden();
});
