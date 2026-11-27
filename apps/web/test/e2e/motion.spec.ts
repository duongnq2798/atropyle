import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { openSettings, runningAnimations } from './helpers.ts';

const HERO = 'What happens to your crypto when you can no longer sign?';

test('reduced motion leaves no running animation', async ({ page, state }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['', 'no-such-page/']) {
    await page.goto(new URL(path, state.siteUrl).href);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // At rest: a finite transition may still finish, a loop never does.
    await expect.poll(() => runningAnimations(page), { timeout: 5_000 }).toEqual([]);
  }
});

test('without reduced motion the thread breathes, so the test above can fail', async ({ page, state }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(state.siteUrl);
  await expect.poll(async () => (await runningAnimations(page)).some((a) => a.startsWith('thread-pulse '))).toBe(true);
});

/**
 * The page's shared element (spec §4.1) is its thread. On `/` that is the thread layer of the weave (7C-T4), which
 * carries the name itself: React's <ViewTransition> names an element only inside a transition React starts, and
 * NavLink starts every one of them (outcome B below).
 */
test('the hero thread carries the shared view-transition name, and it is the only element that does', async ({
  page,
  state,
}) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const named = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((el) => getComputedStyle(el).viewTransitionName === 'atropyle-thread')
      .map((el) => el.getAttribute('data-weave')),
  );
  expect(named).toEqual(['thread']);
});

/**
 * Plan 7A Quyết định 6, outcome B of Task 15: in Next 16.4.6 React did not start a view transition on a client
 * navigation, so the shell's NavLink starts one (withPendingViewTransition). In 7A only `/` and the 404 page exist,
 * and a link to a missing route reloads the document, so the only client navigation is from the 404 page to `/`.
 */
test('a client navigation runs inside a view transition', async ({ page, state }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(new URL('no-such-page/', state.siteUrl).href);
  // The 404 page prints the missing path only once it has mounted: from here on, the header's Link is live.
  await expect(page.getByRole('main').locator('code')).toContainText('/no-such-page/');
  await page.evaluate(() => {
    const w = window as unknown as { __vtCalls: number; __sameDocument: boolean };
    w.__vtCalls = 0;
    w.__sameDocument = true;
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((arg?: Parameters<typeof start>[0]) => {
      w.__vtCalls += 1;
      return start(arg);
    }) as typeof document.startViewTransition;
  });
  await page.getByRole('link', { name: 'Atropyle home' }).click();
  await page.waitForURL(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __vtCalls?: number; __sameDocument?: boolean };
    return { sameDocument: w.__sameDocument === true, calls: w.__vtCalls ?? 0 };
  });
  expect(seen.sameDocument, 'the click loaded a new document instead of navigating on the client').toBe(true);
  expect(seen.calls, 'document.startViewTransition was never called during the navigation').toBeGreaterThan(0);
});

/** What the spy below records: startViewTransition calls, when the home page committed, when the update ended. */
interface Spied {
  calls: number;
  committed?: number;
  done?: number;
}

/**
 * A NavLink inside the page leaves with the old page, in the commit that changes the pathname. The header's home link,
 * which stays, ends the transition then: the browser lets the new picture in as soon as the page has committed, not
 * after the one-second cap of withPendingViewTransition.
 */
test("the 404 page's own home link navigates in a view transition that ends when the new page commits", async ({
  page,
  state,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(new URL('no-such-page/', state.siteUrl).href);
  await expect(page.getByRole('main').locator('code')).toContainText('/no-such-page/');
  await page.evaluate((hero) => {
    const w = window as unknown as { __vt: Spied };
    w.__vt = { calls: 0 };
    // The home page's heading enters the DOM in the commit of the new route, while the old picture still shows.
    new MutationObserver(() => {
      if (w.__vt.committed === undefined && document.querySelector('h1')?.textContent === hero) {
        w.__vt.committed = performance.now();
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((arg?: Parameters<typeof start>[0]) => {
      w.__vt.calls += 1;
      const t = start(arg);
      void t.updateCallbackDone.then(() => {
        w.__vt.done = performance.now();
      });
      return t;
    }) as typeof document.startViewTransition;
  }, HERO);
  await page.getByRole('main').getByRole('link', { name: 'Go to the home page' }).click();
  await page.waitForURL(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  const spied = () => page.evaluate(() => (window as unknown as { __vt: Spied }).__vt);
  expect((await spied()).calls, 'the link did not start a view transition').toBe(1);
  await expect.poll(async () => (await spied()).done).toBeDefined();
  const { committed, done } = await spied();
  expect(committed, 'the home page never committed').toBeDefined();
  // Held to the cap, the update would end about a second after the click, long after the commit.
  expect((done ?? 0) - (committed ?? 0), 'the old picture stayed after the new page had committed').toBeLessThan(300);
});

/** The colour transitions running in the weave: each one's property, the depth of its group, its delay and duration. */
function sweep(page: Page) {
  return page.evaluate(() =>
    document.getAnimations().flatMap((a) => {
      if (!(a instanceof CSSTransition) || !(a.effect instanceof KeyframeEffect)) return [];
      const el = a.effect.target;
      if (!(el instanceof Element) || !el.closest('.weave')) return [];
      const t = a.effect.getTiming();
      return [
        {
          property: a.transitionProperty,
          depth: Number(getComputedStyle(el).getPropertyValue('--d')),
          delay: Number(t.delay),
          duration: Number(t.duration),
        },
      ];
    }),
  );
}

test('a chip sweeps the circuit layer by layer in at most 1.3 s; never on load, never under reduced motion', async ({
  page,
  state,
}) => {
  const chip = (letter: string) => page.locator('label.ask-chip', { has: page.locator(`input[value="${letter}"]`) });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  expect(await sweep(page)).toEqual([]);
  await chip('s').click();
  const run = await sweep(page);
  expect(run.length).toBeGreaterThan(0);
  // The pin turns too, last (1440 px: it is shown). A transition names its longhand: Chromium runs `border-color` as
  // border-top-color, border-right-color, border-bottom-color and border-left-color, never as the shorthand.
  expect(run.some((r) => /^border-(?:top|right|bottom|left)-color$/.test(r.property))).toBe(true);
  for (const r of run) {
    expect(r.duration).toBe(160);
    // calc(var(--d) * 28ms) reaches the timing as a float (17 * 28 came back as 476.00000000000006).
    expect(r.delay).toBeCloseTo(r.depth * 28, 6);
    expect(r.delay + r.duration).toBeLessThanOrEqual(1300);
  }
  await expect.poll(() => sweep(page)).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chip('a').click();
  expect(await sweep(page)).toEqual([]);
});

/**
 * The weave's transitions from now on: `transitionrun` fires for each one that starts, delayed or not, a frame after
 * the style change that created it, and `transitioncancel` for each one stopped before its end.
 */
async function recordWeaveTransitions(page: Page): Promise<() => Promise<{ run: string[]; cancel: string[] }>> {
  await page.evaluate(() => {
    const w = window as unknown as { __weave: { run: string[]; cancel: string[] } };
    w.__weave = { run: [], cancel: [] };
    for (const type of ['run', 'cancel'] as const) {
      document.addEventListener(
        `transition${type}`,
        (e) => {
          if (e.target instanceof Element && e.target.closest('.weave')) w.__weave[type].push(e.propertyName);
        },
        true,
      );
    }
  });
  return () =>
    page.evaluate(() => {
      const w = window as unknown as { __weave: { run: string[]; cancel: string[] } };
      const taken = { run: w.__weave.run.splice(0), cancel: w.__weave.cancel.splice(0) };
      return taken;
    });
}

/** Three frames, read without touching style: what a style change started has sent its events by then. */
const frames = (page: Page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))),
  );

test('a theme change never sweeps the circuit, nor does the device under match device: only a chip does (R18.20)', async ({
  page,
  state,
}) => {
  const chip = (letter: string) => page.locator('label.ask-chip', { has: page.locator(`input[value="${letter}"]`) });
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  const taken = await recordWeaveTransitions(page);
  const html = page.locator('html');
  const settings = await openSettings(page);
  for (const [label, theme] of [
    ['Vellum', 'light'],
    ['Night', 'dark'],
    ['Match device', 'system'],
  ] as const) {
    await settings.getByText(label, { exact: true }).click();
    await expect(html).toHaveAttribute('data-theme', theme);
    expect(await sweep(page), label).toEqual([]);
    await expect(html).not.toHaveAttribute('data-theme-swap');
  }
  // Not one transition started: data-theme-swap was on <html> when the new theme was styled.
  await frames(page);
  expect(await taken()).toEqual({ run: [], cancel: [] });
  // Match device follows the device: it turns light. Chromium styles the new scheme before the media query's change
  // event, where the hold starts, so the colours that started to move are stopped a frame later: nothing sweeps.
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--atro-bg').trim());
  const night = await bg();
  await page.emulateMedia({ colorScheme: 'light' });
  await frames(page);
  expect(await bg()).not.toBe(night);
  expect(await sweep(page)).toEqual([]);
  const flip = await taken();
  expect(flip.cancel.length).toBe(flip.run.length);
  // A chip still sweeps afterwards: the hold is gone, and the recorder sees a sweep when there is one.
  await expect(html).not.toHaveAttribute('data-theme-swap');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await chip('s').click();
  expect((await sweep(page)).length).toBeGreaterThan(0);
  await expect.poll(async () => (await taken()).run.includes('stroke')).toBe(true);
});
