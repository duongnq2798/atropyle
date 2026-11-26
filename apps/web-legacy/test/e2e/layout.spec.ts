import type { Page } from '@playwright/test';
import { ANVIL, expect, test } from './fixtures.ts';

/** How far the document scrolls sideways: 0 when nothing is wider than the viewport. */
function sideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Check names whose first word wraps onto a second line: none, in any column width. */
function brokenNames(page: Page): Promise<string[]> {
  return page.getByTestId('status-checks').evaluate((table) =>
    [...table.querySelectorAll('tbody tr td:first-child')].flatMap((td) => {
      const text = td.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) return [];
      const word = (text.textContent ?? '').split(' ')[0];
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, word.length);
      return range.getClientRects().length === 1 ? [] : [word];
    }),
  );
}

/** Rows whose Expected and Found cells differ in width, so one value would break at different characters. */
function unevenValues(page: Page): Promise<string[]> {
  return page.getByTestId('status-checks').evaluate((table) =>
    [...table.querySelectorAll('tbody tr')].flatMap((tr) => {
      const [expected, found] = [...tr.querySelectorAll('td[data-label]')];
      if (!expected?.textContent || !found?.textContent) return [];
      const gap = Math.abs(expected.getBoundingClientRect().width - found.getBoundingClientRect().width);
      return gap < 1 ? [] : [tr.querySelector('td')?.textContent ?? ''];
    }),
  );
}

/** True when each element starts below the bottom of the one before it. */
function onOwnLines(page: Page, ids: readonly string[]): Promise<boolean> {
  return page.evaluate((list) => {
    const boxes = list.map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect());
    return boxes.every((b, i) => b !== undefined && (i === 0 || b.top >= (boxes[i - 1]?.bottom ?? 0) - 0.5));
  }, ids);
}

const SIZES = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 900 }],
] as const;

for (const [name, size] of SIZES) {
  test(`the status page, a vault, a signing link and a bad address never scroll sideways on a ${name}`, async ({
    page,
    atro,
    state,
  }) => {
    await page.setViewportSize(size);
    await page.goto(`${state.siteUrl}#/status`);
    await expect(page.getByTestId('status-integrity')).toHaveAttribute('data-ok', 'true');
    await expect(page.getByTestId('status-rpc-0')).toHaveAttribute('data-ok', 'true');
    await expect(page.getByTestId('counters')).toHaveAttribute('data-status', 'ok');
    expect(await sideways(page)).toBe(0);
    expect(await brokenNames(page)).toEqual([]);
    expect(await unevenValues(page)).toEqual([]);

    await page.goto(`${state.siteUrl}#/v/${state.seeded.simple}`);
    await expect(page.getByTestId('asset-0-token')).toBeVisible();
    expect(await onOwnLines(page, ['asset-0-name', 'asset-0-symbol', 'asset-0-token'])).toBe(true);
    expect(await sideways(page)).toBe(0);

    const plan = await atro.prepare.createVault(
      atro.plan.template('simple', {
        heirs: [{ account: ANVIL[2] }],
        drill: true,
        assets: [{ kind: 'erc20', token: atro.deployment.feeTokens[0] }],
      }),
      { owner: ANVIL[1], drill: true },
    );
    await page.goto(atro.handoff.link(plan, state.siteUrl));
    await expect(page.getByTestId('sign-step-0')).toBeVisible();
    expect(await sideways(page)).toBe(0);
    if (name === 'desktop') {
      // The contract address of a step sits on one line: its column is never squeezed.
      const addr = page.getByTestId('sign-step-0').locator('.addr').first();
      expect(await addr.evaluate((e) => e.getClientRects().length)).toBe(1);
    }

    await page.goto(`${state.siteUrl}#/v/0x${'Z'.repeat(70)}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await sideways(page)).toBe(0);
  });
}

test.describe('under a dark OS', () => {
  test.use({ colorScheme: 'dark' });

  /**
   * What a light-only page renders: the body, the root scheme, and the first input with its placeholder. A computed
   * color-scheme lists its keywords in an order of the browser's choosing ("light only"), so they come back sorted.
   */
  function look(page: Page) {
    return page.evaluate(() => {
      const scheme = (e: Element) => getComputedStyle(e).colorScheme.split(/\s+/).sort().join(' ');
      const input = document.querySelector('input');
      return {
        dark: matchMedia('(prefers-color-scheme: dark)').matches,
        meta: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
        root: scheme(document.documentElement),
        body: getComputedStyle(document.body).backgroundColor,
        input: input && { scheme: scheme(input), placeholder: getComputedStyle(input, '::placeholder').color },
      };
    });
  }

  test('the site stays light: cream body, light controls and scrollbars, muted placeholders', async ({
    page,
    state,
  }) => {
    const light = { dark: true, meta: 'only light', root: 'light only', body: 'rgb(246, 241, 231)' };

    await page.goto(state.siteUrl);
    await expect(page.getByTestId('home-open-input')).toBeVisible();
    // --muted (#5e574c), not the browser grey (#757575), which is below 4.5:1 on --bg.
    expect(await look(page)).toEqual({ ...light, input: { scheme: 'light only', placeholder: 'rgb(94, 87, 76)' } });

    await page.goto(`${state.siteUrl}#/status`);
    await expect(page.getByTestId('status-integrity')).toHaveAttribute('data-ok', 'true');
    expect(await look(page)).toMatchObject(light);

    await page.goto(`${state.siteUrl}#/create?drill=1`);
    await expect(page.getByTestId('create-editors')).toBeVisible();
    expect(await look(page)).toMatchObject(light);
    // The wrapper of the wizard has no frame; the step inside it has one thin --line border, not the grey groove.
    const border = (sel: string) =>
      page.locator(sel).evaluate((e) => {
        const s = getComputedStyle(e);
        return `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`;
      });
    expect(await border('[data-testid="create-editors"]')).toMatch(/^0px none /);
    expect(await border('[data-testid="create-editors"] > fieldset')).toBe('1px solid rgb(221, 211, 194)');
  });

  test('the keyboard focus ring is the --fg ring of the site, never the browser default', async ({ page, state }) => {
    await page.goto(state.siteUrl);
    await expect(page.getByTestId('home-open-input')).toBeVisible();
    const rings: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      rings.push(
        await page.evaluate(() => {
          const e = document.activeElement;
          if (!e || e === document.body) return 'body';
          const s = getComputedStyle(e);
          return `${e.matches(':focus-visible')} ${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor} ${s.outlineOffset}`;
        }),
      );
    }
    // --fg is #16130f.
    expect(rings).toEqual(Array(6).fill('true 2px solid rgb(22, 19, 15) 2px'));
  });
});
