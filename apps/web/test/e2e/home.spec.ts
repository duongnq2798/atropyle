import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { shouldCapture } from './screens.ts';

/** The layout shift of the page so far, as CLS counts it (rounded as scripts/lib/lighthouse-score.ts rounds it). */
function layoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let sum = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!shift.hadRecentInput) sum += shift.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        // Buffered entries arrive in a task of their own.
        setTimeout(() => resolve(Math.round(sum * 1000) / 1000), 250);
      }),
  );
}

/** A chip's label, found by its radio's value: a click on it checks the radio, as a reader's would. */
const chip = (page: Page, letter: 'a' | 's' | 'l') =>
  page.locator('label.ask-chip', { has: page.locator(`input[value="${letter}"]`) });

/** The data-v of the wire paths drawn in a colour other than an unlit one's, and of every path that lights at all. */
function voices(page: Page): Promise<{ lit: string[]; all: string[] }> {
  return page.locator('.weave-col path').evaluateAll((paths) => {
    const plain = paths.find((p) => !p.hasAttribute('data-v'));
    if (!plain) throw new Error('no unlit wire path');
    const unlit = getComputedStyle(plain).stroke;
    const v = (p: Element) => p.getAttribute('data-v') ?? '';
    const uniq = (a: string[]) => [...new Set(a)].sort();
    return {
      lit: uniq(paths.filter((p) => getComputedStyle(p).stroke !== unlit).map(v)),
      all: uniq(paths.map(v).filter(Boolean)),
    };
  });
}

/** A CSS colour as the page computes it. */
function computed(page: Page, value: string): Promise<string> {
  return page.evaluate((v) => {
    const probe = document.createElement('i');
    probe.style.color = v;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, value);
}

test('on a phone the weave is a strip under the question, and the facts take three lines without a shift', async ({
  page,
  state,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(state.siteUrl);
  const facts = page.getByTestId('hero-facts');
  // Hydrated: the DeWEB build prints the live fact as text and links it on mount.
  await expect(facts.locator('a[target="_blank"]')).toHaveCount(1);
  const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
  const strip = await page.locator('.weave').boundingBox();
  const lead = await page.getByText(/^Nothing, unless you plan for it\./).boundingBox();
  if (h1 === null || strip === null || lead === null) throw new Error('the hero is not laid out');
  expect(strip.y).toBeGreaterThanOrEqual(h1.y + h1.height);
  expect(lead.y).toBeGreaterThanOrEqual(strip.y + strip.height);
  expect(strip.x).toBeCloseTo(0, 0);
  expect(strip.width).toBeCloseTo(390, 0);
  // The sweep boxes are the size of the strip, not of the plate (494.6 % of it here): a box as wide as the plate
  // would uncover the strip in a flash (Ruling R22).
  for (const layer of ['warp', 'thread']) {
    const sweep = await page.locator(`[data-weave="${layer}"] .weave-sweep`).boundingBox();
    expect(sweep?.width, layer).toBeCloseTo(390, 0);
  }
  const tops = await facts.locator('li').evaluateAll((items) => items.map((li) => li.getBoundingClientRect().top));
  expect(tops).toHaveLength(3);
  expect(tops[1]).toBeGreaterThan(tops[0]);
  expect(tops[2]).toBeGreaterThan(tops[1]);
  // The release pin is cropped away on a phone; the ring before the answer stands for it (ruling R16).
  await expect(page.locator('.weave-pin')).toBeHidden();
  await expect(page.locator('label.ask-chip')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await layoutShift(page)).toBe(0);
});

test('each chip lights the wires that carry 1 for its question, answers it and rings the pin, with no shift', async ({
  page,
  state,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The e2e build reads the devnet (chain 31337): it never offers to ask X Layer (R18.19).
  await expect(page.getByTestId('ask-x-layer')).toHaveCount(0);
  const lead = page.getByText(/^Nothing, unless you plan for it\./);
  const before = await lead.boundingBox();
  const gold = await computed(page, 'var(--atro-thread)');
  const violet = await computed(page, 'var(--atro-release)');
  const QUESTIONS = [
    { letter: 'a', name: 'If I keep checking in', answer: 'Nothing moves. The gate stays closed.', open: false },
    { letter: 's', name: 'If I go silent', answer: 'The gate opens. Your heirs can claim.', open: true },
    {
      letter: 'l',
      name: 'If my guardians lie while I keep checking in',
      answer: 'The gate stays closed. Your check-in outweighs their word.',
      open: false,
    },
  ] as const;
  for (const q of QUESTIONS) {
    await chip(page, q.letter).click();
    await expect(page.getByRole('radio', { name: q.name, exact: true })).toBeChecked();
    const { lit, all } = await voices(page);
    expect(lit.length, q.letter).toBeGreaterThan(0);
    expect(lit, q.letter).toEqual(all.filter((v) => v.split(' ').includes(q.letter)));
    for (const other of QUESTIONS) {
      const answer = page.locator(`.ask-answer [data-for="${other.letter}"]`);
      if (other === q) {
        await expect(answer).toBeVisible();
        await expect(answer).toHaveText(q.answer);
      } else {
        await expect(answer).toBeHidden();
      }
    }
    await expect(page.locator('.weave-pin')).toHaveCSS('border-color', q.open ? violet : gold);
    expect(await lead.boundingBox(), q.letter).toEqual(before);
  }
  expect(await layoutShift(page)).toBe(0);
});

for (const width of [1440, 1024]) {
  test(`from 64rem the weave fills the hero, behind its text, and fades under the text column (${width} px)`, async ({
    page,
    state,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(state.siteUrl);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const hero = await page.locator('main section').first().boundingBox();
    const weave = await page.locator('.weave').boundingBox();
    if (hero === null || weave === null) throw new Error('the hero is not laid out');
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(weave[k], k).toBeCloseTo(hero[k], 0);
    expect(await page.locator('.weave').evaluate((el) => getComputedStyle(el).zIndex)).toBe('-1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    // The mask holds 12 % up to --wv-text (globals.css), which must end where the text column ends. A probe inside the
    // layer inherits the custom property, and its 100 % resolves against the layer as the gradient's does.
    const { edge, column } = await page.evaluate(() => {
      const layer = document.querySelector('[data-weave="warp"]') as HTMLElement;
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:0;top:0;height:1px;width:var(--wv-text)';
      layer.append(probe);
      const right = probe.getBoundingClientRect().right;
      probe.remove();
      // The H1's parent is the text column (src/home/hero.tsx).
      const column = (document.querySelector('h1') as HTMLElement).parentElement as HTMLElement;
      return { edge: right, column: column.getBoundingClientRect().right };
    });
    expect(edge).toBeCloseTo(column, 0);
  });
}

/**
 * Review screens of the sweep on a phone, mid-way (SCREENS=1 only): at 450 ms the circuit is almost uncovered and
 * the thread not yet begun; at 800 ms the thread is about half across the strip.
 */
test('screens of the weave mid-sweep on a phone, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const ms of [450, 800]) {
    // currentTime counts from the start, delays included, so each sweep keeps its own delay.
    await page.evaluate((t) => {
      for (const a of document.getAnimations()) {
        if (a instanceof CSSAnimation && a.animationName.startsWith('weave-')) {
          a.pause();
          a.currentTime = t;
        }
      }
    }, ms);
    await page
      .locator('main section')
      .first()
      .screenshot({ path: `test-results/screens/home-sweep/night-en-390-${ms}ms.png` });
  }
});
