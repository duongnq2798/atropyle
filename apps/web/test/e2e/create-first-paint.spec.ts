import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { captureScreens, shouldCapture } from './screens.ts';

/**
 * Spec §11 asks CLS 0 on /create/ (a Lighthouse route), and §18.2 rule 6 says the first paint is the final layout.
 * The quiet run measured 0.0154: the dock grew by the preview strip's 72 px when the flow chunk arrived. The CPU is
 * slowed, as Lighthouse slows it, so that the static HTML paints well before the page mounts: on a fast machine the
 * two could land in one frame and hide a shift. The method is first-paint.spec.ts's (7B-P1).
 */
interface Shift {
  value: number;
  /** What moved, for the failure message: each node's tag, test id or class, and its rectangles. */
  sources: string[];
}

/** Every layout shift no input caused, from the navigation on, summed in the page. Added once: every load is a new window. */
async function recordShifts(page: Page): Promise<void> {
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
}

async function shiftOnLoad(page: Page, url: string, final: () => Promise<void>): Promise<Shift> {
  // A first visit puts the fonts in the cache; a cold visit also moves the header's links when the display faces swap
  // in, which is the shell's on every page and not what this test guards (7B-P1 Ruling). The measured visit is the second.
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  try {
    await page.goto(url, { waitUntil: 'load' });
    await final();
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

test('/create/ does not move while it loads, at 390 and at 1440', async ({ page, state }, info) => {
  // The phone project stands for the Lighthouse device; the desktop project measures both widths.
  const widths = info.project.name === 'desktop' ? [1440, 390] : [390];
  await recordShifts(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const shift = await shiftOnLoad(page, `${state.siteUrl}create/`, async () => {
      await expect(page.getByTestId('create')).toHaveAttribute('data-ready', 'true');
      // The late part of each layout is in: the strip in the dock below lg, the preview rail from lg.
      await expect(page.getByTestId(width < 1024 ? 'create-strip' : 'create-preview')).toBeVisible();
    });
    expect(shift.value, `layout shift of /create/ at ${width}: ${shift.sources.join('; ')}`).toBe(0);
  }
});

test('the static HTML of /create/ already holds the strip place at 390', async ({ page, state }) => {
  // No script chunk ever comes: what shows is the first paint, and its dock is as tall as the loaded one.
  await page.route(
    (url) => url.pathname.endsWith('.js'),
    (route) => route.abort(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${state.siteUrl}create/`);
  await expect(page.getByTestId('create-strip-frame')).toBeVisible();
  const frame = await page.getByTestId('create-strip-frame').boundingBox();
  expect(frame?.height).toBe(72);
});

test('screens of the first paint', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'SCREENS=1 only');
  // The static HTML alone, as a slow phone shows it before the page mounts. The language applies after hydration, so
  // only English; the frame shows below lg.
  await page.route(
    (url) => url.pathname.endsWith('.js'),
    (route) => route.abort(),
  );
  await page.goto(`${state.siteUrl}create/`);
  const frame = () => expect(page.getByTestId('create-strip-frame')).toBeVisible();
  await captureScreens(page, 'create-first-paint', {
    shots: [
      { theme: 'light', lang: 'en', width: 390 },
      { theme: 'light', lang: 'en', width: 768 },
      { theme: 'dark', lang: 'en', width: 390 },
    ],
    ready: frame,
  });
});
