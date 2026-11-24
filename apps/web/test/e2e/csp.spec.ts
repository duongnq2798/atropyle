import { expect, test } from './fixtures.ts';

test('every page runs under its policy without a single violation', async ({ page, state }) => {
  // The page fixture fails the test on any violation; the worker page also loads a module worker and its chunks.
  for (const path of ['', 'no-such-page/', 'e2e/worker/']) {
    await page.goto(new URL(path, state.siteUrl).href);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
});

test('an injected inline script is blocked and reported', async ({ page, state, cspViolations }) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__injected = true;';
    document.head.append(s);
    return (window as unknown as { __injected?: boolean }).__injected === true;
  });
  expect(ran).toBe(false);
  await expect.poll(() => cspViolations.map((v) => v.directive)).toEqual(['script-src-elem']);
  // Provoked on purpose: clear it, so the fixture still guards the rest of this test.
  cspViolations.length = 0;
});
