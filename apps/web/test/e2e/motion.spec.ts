import { expect, test } from './fixtures.ts';
import { runningAnimations } from './helpers.ts';

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
 * The hero's Thread is the page's shared element (spec §4.1). It carries the name itself: React's <ViewTransition>
 * names an element only inside a transition React starts, and NavLink starts every one of them (outcome B below).
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
      .map((el) => el.hasAttribute('data-thread')),
  );
  expect(named).toEqual([true]);
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
