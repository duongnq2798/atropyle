import { expect, test } from './fixtures.ts';

test('the proof worker loads and runs under the page policy', async ({ page, state }) => {
  await page.goto(new URL('e2e/worker/', state.siteUrl).href);
  for (const id of ['worker-smoke', 'worker-verify']) {
    const row = page.getByTestId(id);
    await expect(row).not.toHaveAttribute('data-state', 'running', { timeout: 60_000 });
    expect(`${await row.getAttribute('data-state')}: ${await row.textContent()}`, id).toMatch(/^ok: /);
  }
});
