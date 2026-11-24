import { expect, test } from './fixtures.ts';
import { runningAnimations } from './helpers.ts';

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
