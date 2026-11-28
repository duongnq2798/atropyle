import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import {
  expectAccessible,
  expectAccessibleInBothThemes,
  openSettings,
  setStoredLang,
  setStoredTheme,
  settle,
} from './helpers.ts';
import { captureScreens, FULL_MATRIX, shouldCapture } from './screens.ts';

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

/** Where the parts of the hero are, top to bottom, as a reader sees them. */
async function heroParts(page: Page) {
  const box = async (name: string, at: ReturnType<Page['locator']>) => {
    const b = await at.boundingBox();
    if (b === null) throw new Error(`${name} is not laid out`);
    return b;
  };
  // Inside the hero: the closing scene (7C T7a) offers the same Drill with the same note.
  const hero = page.locator('section.hero');
  return {
    question: await box('the H1', hero.getByRole('heading', { level: 1 })),
    answer: await box('the lead', hero.getByText(/^Nothing, unless you plan for it\./)),
    drill: await box('the Drill offer', hero.getByRole('link', { name: 'Rehearse it in about 6 minutes' })),
    note: await box('its note', hero.getByText(/^No Atropyle fee\./)),
    strip: await box('the weave', hero.locator('.weave')),
    chips: await box('the chips', hero.getByRole('group', { name: 'Ask the circuit' })),
    said: await box('the checked answer', hero.locator('.ask-answer [data-for="a"]')),
    facts: await box('the facts', hero.getByTestId('hero-facts')),
  };
}

test('on a phone the weave is a strip over the chips, and the facts take three lines without a shift', async ({
  page,
  state,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(state.siteUrl);
  const facts = page.getByTestId('hero-facts');
  // Hydrated: the DeWEB build prints the live fact as text and links it on mount.
  await expect(facts.locator('a[target="_blank"]')).toHaveCount(1);
  // The question, its answer, the two ways in, then the strip right over the chips, so a chip and the wires it
  // lights share the screen; the facts last (ruling R-T5p-7).
  const { question, answer, drill, note, strip, chips, facts: factsBox } = await heroParts(page);
  const bottom = (b: { y: number; height: number }) => b.y + b.height;
  expect(answer.y).toBeGreaterThanOrEqual(bottom(question));
  expect(drill.y).toBeGreaterThanOrEqual(bottom(answer));
  expect(strip.y).toBeGreaterThanOrEqual(bottom(note));
  expect(chips.y).toBeGreaterThanOrEqual(bottom(strip));
  expect(chips.y - bottom(strip)).toBeLessThanOrEqual(32);
  expect(factsBox.y).toBeGreaterThan(bottom(chips));
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
  // The facts come after the chips: a chip that changed the height of its answer would move them.
  const facts = page.getByTestId('hero-facts');
  const before = await facts.boundingBox();
  const gold = await computed(page, 'var(--atro-thread)');
  const violet = await computed(page, 'var(--atro-release)');
  const QUESTIONS = [
    {
      letter: 'a',
      name: 'If I keep checking in',
      answer: 'The gate stays closed. Your wallet stays yours.',
      open: false,
    },
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
    expect(await facts.boundingBox(), q.letter).toEqual(before);
  }
  expect(await layoutShift(page)).toBe(0);
});

/** How a chip looks: its border and fill, and the ring before its label (its ::before). */
function chipLook(page: Page, letter: 'a' | 's' | 'l') {
  return chip(page, letter)
    .locator('span')
    .evaluate((face) => {
      const s = getComputedStyle(face);
      const ring = getComputedStyle(face, '::before');
      return {
        border: s.borderColor,
        fill: s.backgroundColor,
        ink: s.color,
        ring:
          ring.content === 'none' ? null : { size: ring.width, edge: ring.borderTopColor, dot: ring.backgroundColor },
      };
    });
}

test('only the checked chip wears the thread, as a filled ring and a tint; a hovered chip never looks checked', async ({
  page,
  state,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const clear = 'rgba(0, 0, 0, 0)';
  // Touch screens have no hover (src/home/home.css keeps it in @media (hover: hover)): there the hovered chip is a plain one.
  const hovers = info.project.name === 'desktop';
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') await setStoredTheme(page, 'light');
    const gold = await computed(page, 'var(--atro-thread)');
    const tint = await computed(page, 'color-mix(in oklab, var(--atro-thread) 12%, transparent)');
    const muted = await computed(page, 'var(--atro-ink-muted)');
    // The ring costs width: in English the three chips must still share one row of the 644 px text column.
    const tops = await page
      .locator('label.ask-chip > span')
      .evaluateAll((s) => s.map((e) => e.getBoundingClientRect().top));
    expect(new Set(tops).size, theme).toBe(1);
    // "If I keep checking in" is checked at load; the mouse rests on "If I go silent".
    await chip(page, 's').hover();
    await settle(page);
    const checked = await chipLook(page, 'a');
    const hovered = await chipLook(page, 's');
    const plain = await chipLook(page, 'l');
    // A shape on every chip, so the choice reads without its hue: an empty ring in the chip's own ink.
    for (const [name, look] of [
      ['hovered', hovered],
      ['plain', plain],
    ] as const) {
      expect(look.border, `${theme} ${name}`).not.toBe(gold);
      expect(look.fill, `${theme} ${name}`).toBe(clear);
      expect(look.ring, `${theme} ${name}`).toEqual({ size: '8px', edge: look.ink, dot: clear });
    }
    if (hovers) expect(hovered.border, theme).toBe(muted);
    expect(checked.border, theme).toBe(gold);
    expect(checked.fill, theme).toBe(tint);
    expect(checked.ring, theme).toEqual({ size: '8px', edge: gold, dot: gold });
    // The mouse on the checked chip leaves it checked-looking: hover never takes the choice's thread away.
    await chip(page, 'a').hover();
    await settle(page);
    expect(await chipLook(page, 'a'), theme).toEqual(checked);
  }
  await setStoredTheme(page, 'dark');
  // High contrast drops every author colour and fill: the filled ring, in the system's own ink, is what is left.
  await page.emulateMedia({ forcedColors: 'active' });
  const canvasText = await computed(page, 'CanvasText');
  expect((await chipLook(page, 'a')).ring?.dot).toBe(canvasText);
  // Forced colours keep a fill's alpha and swap its hue for Canvas: the empty ring stays clear.
  expect((await chipLook(page, 'l')).ring?.dot).toMatch(/^rgba\(\d+, \d+, \d+, 0\)$/);
});

/**
 * The first screen of a laptop and of a phone holds the question, its answer and the Drill offer (fix round 1 of
 * 7C-T5′: with the chips above the lead, the offer started at 843 px on a 1440 × 800 screen). On a 1440 × 800 laptop
 * the chips and the checked answer fit as well, over the weave they light.
 */
for (const [width, height, chipsToo] of [
  [1440, 800, true],
  [1366, 680, false],
  [1280, 720, false],
  [390, 750, false],
] as const) {
  test(`the first screen holds the question, its answer and the Drill offer (${width} × ${height})`, async ({
    page,
    state,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(state.siteUrl);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const { question, answer, drill, chips, said } = await heroParts(page);
    expect(answer.y).toBeGreaterThanOrEqual(question.y + question.height);
    expect(drill.y + drill.height).toBeLessThanOrEqual(height);
    if (chipsToo) {
      expect(chips.y).toBeGreaterThan(drill.y + drill.height);
      expect(said.y + said.height).toBeLessThanOrEqual(height);
    }
  });
}

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
    // The mask holds 12 % up to --wv-text (src/home/home.css), which must end where the text column ends. A probe inside the
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

/**
 * Review screens of the chips at 1440 px in night and vellum (SCREENS=1 only): "If I keep checking in" checked, the
 * mouse on "If I go silent", so the hovered chip can be told from the checked one. The full page, then its chips.
 */
test('screens of a hovered chip beside the checked one, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await captureScreens(page, 'home-hover', {
    shots: [
      { theme: 'dark', lang: 'en', width: 1440 },
      { theme: 'light', lang: 'en', width: 1440 },
    ],
    ready: async (p) => {
      await chip(p, 's').hover();
      const scheme = (await p.locator('html').getAttribute('data-theme')) === 'light' ? 'vellum' : 'night';
      await settle(p);
      await p
        .getByRole('group', { name: 'Ask the circuit' })
        .screenshot({ path: `test-results/screens/home-hover/${scheme}-en-1440-chips.png` });
    },
  });
});

// ---- 7C T6: the stage (spec §18.4.3 Task 6) ----

const stage = (page: Page) => page.getByTestId('home-stage');
/** A chip's label on the stage, by its radio's value: language-free, for the Vietnamese screens too. */
const storyChip = (page: Page, value: 'inherit' | 'recover') =>
  stage(page).locator('label.stage-chip', { has: page.locator(`input[value="${value}"]`) });
/**
 * The stage has hydrated: its controls stay disabled until then (R16), and they are enabled by the render after the
 * one whose effect attached the intent listeners (useMounted is a useSyncExternalStore; React flushes that effect
 * before it renders again). Before this, a focus, a click or a wheel can reach a stage that listens for nothing (R30).
 */
async function hydrated(page: Page): Promise<void> {
  await expect(stage(page).locator('input[value="inherit"]')).toBeEnabled();
}
/** Focus is intent (R18.18): the stage loads the time machine and the circuits, and computes its six stories. */
async function loadStage(page: Page): Promise<void> {
  // locator.focus() has no actionability wait: on a radio still disabled it does nothing, and no focusin comes.
  const radio = stage(page).locator('input[value="inherit"]');
  await hydrated(page);
  await radio.focus();
  await expect(radio).toBeFocused();
  await expect(stage(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}
/**
 * A box in the page's own coordinates, so a scroll by Playwright before a click cannot pass for a move. The panel is
 * sticky from 64rem, so the tests that use this first scroll the stage to the top of the viewport: the panel is not
 * stuck there, and the chips and the switches are in view (R31).
 */
function pageBox(target: Locator) {
  return target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  });
}
type Box = Awaited<ReturnType<typeof pageBox>>;
const WHOLE = ['x', 'y', 'width', 'height'] as const;
function expectSameBox(after: Box, before: Box, what: string, keys: readonly (keyof Box)[] = WHOLE): void {
  for (const k of keys) expect(Math.abs(after[k] - before[k]), `${what}: ${k}`).toBeLessThanOrEqual(0.5);
}

test('the stage waits for intent: a load, an idle page and a scroll by script load nothing', async ({
  page,
  state,
}) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await stage(page).evaluate((el) => el.scrollIntoView());
  // Past the idle callback's 2 s: a stage that loaded at idle, or on a scroll by script, would be ready by now.
  await page.waitForTimeout(3_000);
  await expect(stage(page)).toHaveAttribute('data-ready', 'false');
  await expect(stage(page)).toHaveAttribute('data-engine', 'prerender');
  await loadStage(page);
  await expect(stage(page)).toHaveAttribute('data-engine', 'netlist');
  await expect(stage(page).getByTestId('home-stage-scrubber-thumb-0')).toBeVisible();
});

test('a wheel arms the stage: once its panel is in view, it loads', async ({ page, state }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // A wheel before hydration arms nothing, and the loop below stops once the panel is in view (R30).
  await hydrated(page);
  const panel = stage(page).locator('[data-part="stage"]');
  // Over the page's margin, never pressing anything.
  await page.mouse.move(24, 450);
  await expect(async () => {
    await page.mouse.wheel(0, 300);
    await expect(panel).toBeInViewport({ ratio: 0.5, timeout: 250 });
  }).toPass({ timeout: 15_000 });
  await expect(stage(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
});

test('the Scrubber takes the still thread’s place without moving the page', async ({ page, state }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(state.siteUrl);
    await stage(page).evaluate((el) => el.scrollIntoView());
    await settle(page);
    const thread = stage(page).locator('[data-thread]');
    // Day 0 of the default story: its gate is named before the load and after it, in one place (fix round 1).
    const gate = stage(page).locator('[data-part="gate-at"]');
    await expect(gate, `${width} px: the story's gate`).toHaveText(/^Heirs · day\s194$/);
    const before = await thread.boundingBox();
    const named = await gate.boundingBox();
    // Fix round 3: the playhead's dot and glow are whole before the load (the Thread's box clips, so its own "now"
    // at day 0 was a half disc), and stand where the thumb draws them after it.
    await expect(thread.locator('[data-part="now-at"]'), `${width} px: the Thread's own "now"`).toBeHidden();
    const stillDot = await stage(page).locator('[data-part="still-dot"]').boundingBox();
    const stillHalo = stage(page).locator('[data-part="still-halo"]');
    const haloBefore = await stillHalo.boundingBox();
    const clips = await stillHalo.evaluate((el) => {
      const found: string[] = [];
      for (let a = el.parentElement; a && a.dataset.part !== 'stage'; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') found.push(`${a.tagName} ${s.overflow}`);
      }
      return found;
    });
    expect(clips, `${width} px: a box that clips the playhead's glow`).toEqual([]);
    await loadStage(page);
    await expect(stage(page).getByTestId('home-stage-scrubber-thumb-0')).toBeVisible();
    await settle(page);
    const scrubNow = stage(page).locator('[data-part="scrub-now"]');
    const dots = {
      dot: [stillDot, await scrubNow.boundingBox()],
      halo: [haloBefore, await scrubNow.locator('xpath=preceding-sibling::span[1]').boundingBox()],
    };
    for (const [part, [still, thumb]] of Object.entries(dots)) {
      expect(still, `${width} px: no still ${part}`).not.toBeNull();
      for (const k of ['x', 'y', 'width', 'height'] as const) {
        expect(
          Math.abs((thumb?.[k] ?? Number.NaN) - (still?.[k] ?? 0)),
          `${width} px: ${part} ${k}`,
        ).toBeLessThanOrEqual(0.5);
      }
    }
    const after = await thread.boundingBox();
    await expect(gate, `${width} px: the story's gate, loaded`).toHaveText(/^Heirs · day\s194$/);
    const renamed = await gate.boundingBox();
    expect(before, `${width} px: no still thread`).not.toBeNull();
    expect(named, `${width} px: no gate label`).not.toBeNull();
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs((after?.[k] ?? Number.NaN) - (before?.[k] ?? 0)), `${width} px: ${k}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs((renamed?.[k] ?? Number.NaN) - (named?.[k] ?? 0)), `${width} px: gate ${k}`).toBeLessThanOrEqual(
        0.5,
      );
    }
    expect(await layoutShift(page), `${width} px`).toBe(0);
  }
});

test('a chip or a switch retells the story in place: the thread, the panel and the switches never move', async ({
  page,
  state,
}) => {
  const s = stage(page);
  const label = (testId: string) => s.locator('label', { has: page.getByTestId(testId) });
  // From the first story through the five others and back to it, one click a step (§18.2 rule 6, Review Focus 5).
  const STEPS = [
    ['confirm switch', () => label('home-stage-confirm'), 'silent'],
    ['back switch', () => label('home-stage-back'), 'back'],
    ['confirm switch', () => label('home-stage-confirm'), 'confirmBack'],
    ['Recovery chip', () => storyChip(page, 'recover'), 'recoverBack'],
    ['back switch', () => label('home-stage-back'), 'recover'],
    ['Inheritance chip', () => storyChip(page, 'inherit'), 'confirm'],
  ] as const;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(state.siteUrl);
    // The controls in view, so no click scrolls; the panel (sticky from 64rem) is not stuck here.
    await s.evaluate((el) => el.scrollIntoView());
    await loadStage(page);
    await settle(page);
    const thread = s.locator('[data-thread]');
    const panel = s.locator('[data-part="stage"]');
    const before = {
      thread: await pageBox(thread),
      panel: await pageBox(panel),
      confirm: await pageBox(label('home-stage-confirm')),
      back: await pageBox(label('home-stage-back')),
    };
    for (const [what, control, story] of STEPS) {
      await control().click();
      await expect(s, `${width} px, ${what}`).toHaveAttribute('data-story', story);
      // The Scrubber is keyed by the story: this is its new mount.
      await expect(s.getByTestId('home-stage-scrubber-thumb-0')).toBeVisible();
      await settle(page);
      const at = `${width} px, ${what} → ${story}`;
      expectSameBox(await pageBox(thread), before.thread, `${at}: thread`);
      // The frame's sentence under the thread may wrap to one more line: the panel's height is free, its place is not.
      expectSameBox(await pageBox(panel), before.panel, `${at}: panel`, ['x', 'y', 'width']);
      // Under Recovery the confirm switch is dimmed in its place (R25), so neither switch moves.
      expectSameBox(await pageBox(label('home-stage-confirm')), before.confirm, `${at}: confirm switch`);
      expectSameBox(await pageBox(label('home-stage-back')), before.back, `${at}: back switch`);
    }
    // A shift within 500 ms of a click is not counted here (hadRecentInput): the boxes above are the check (R31).
    expect(await layoutShift(page), `${width} px`).toBe(0);
  }
});

test('the thumb walks the stories on the keyboard, and the switches retell them', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  await loadStage(page);
  const s = stage(page);
  const caption = s.getByTestId('home-stage-caption');
  const thumb = s.getByTestId('home-stage-scrubber-thumb-0');
  await thumb.focus();
  await page.keyboard.press('PageUp');
  await expect(s).toHaveAttribute('data-state', 'grace');
  await expect(caption).toContainText('Day 180 · Silence. The alarm');
  await page.keyboard.press('End');
  await expect(s).toHaveAttribute('data-state', 'releasedInherit');
  await expect(caption).toContainText('Day 194 · Through the gate');
  await s.getByText('A guardian confirms on day 183').click();
  await expect(s).toHaveAttribute('data-story', 'silent');
  await thumb.focus();
  await page.keyboard.press('End');
  await expect(caption).toContainText('Day 450 · Through the gate');
  await s.getByText('I come back on day 187').click();
  await expect(s).toHaveAttribute('data-story', 'back');
  await storyChip(page, 'recover').click();
  await expect(s).toHaveAttribute('data-story', 'recoverBack');
  await expect(s.getByTestId('home-stage-confirm')).toBeDisabled();
  await s.getByText('I come back on day 20').click();
  await expect(s).toHaveAttribute('data-story', 'recover');
  await thumb.focus();
  await page.keyboard.press('End');
  await expect(s).toHaveAttribute('data-state', 'releasedRecover');
  await expect(caption).toContainText('Day 26 · To the wallet they chose');
  await expectAccessible(page);
});

test('without its simulator the stage still tells every story, says so, and tries again', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settle(page);
  // From here every chunk fails, as offline: the first load has all of its own.
  await page.route('**/_next/static/chunks/**', (r) => r.abort());
  const s = stage(page);
  await s.getByTestId('home-stage-beat-2').click();
  await expect(s).toHaveAttribute('data-state', 'grace');
  await expect(s).toHaveAttribute('data-ready', 'error', { timeout: 20_000 });
  await expect(s.getByTestId('home-stage-footer')).toContainText('could not load the simulator');
  // The still thread retells a story in place too (Review Focus 5). The row's click may have scrolled the page:
  // back to the stage's top, where the chips are in view and the panel is not stuck.
  await s.evaluate((el) => el.scrollIntoView());
  const still = await pageBox(s.locator('[data-thread]'));
  await storyChip(page, 'recover').click();
  await expect(s).toHaveAttribute('data-story', 'recover');
  expectSameBox(await pageBox(s.locator('[data-thread]')), still, 'the still thread under Recovery');
  await page.unroute('**/_next/static/chunks/**');
  await s.getByRole('button', { name: 'Try again' }).click();
  await expect(s).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
});

/**
 * Every frame of the six stories, as a reader reaches them: each row of the default story, then one control a step
 * through the five others (§18.2 rule 6), each row of each. `visit` runs once the pressed row is the current one.
 */
async function eachFrame(page: Page, visit: (story: string, row: number, rows: number) => Promise<void>) {
  const s = stage(page);
  const label = (testId: string) => s.locator('label', { has: page.getByTestId(testId) });
  const STEPS = [
    ['confirm switch', () => label('home-stage-confirm'), 'silent'],
    ['back switch', () => label('home-stage-back'), 'back'],
    ['confirm switch', () => label('home-stage-confirm'), 'confirmBack'],
    ['Recovery chip', () => storyChip(page, 'recover'), 'recoverBack'],
    ['back switch', () => label('home-stage-back'), 'recover'],
  ] as const;
  const walk = async (story: string) => {
    const n = await s.getByTestId('home-stage-beats').getByRole('button').count();
    for (let i = 0; i < n; i++) {
      await s.getByTestId(`home-stage-beat-${i}`).click();
      await expect(s.getByTestId(`home-stage-beat-${i}`)).toHaveAttribute('aria-current', 'step');
      await visit(story, i, n);
    }
  };
  await expect(s).toHaveAttribute('data-story', 'confirm');
  await walk('confirm');
  for (const [what, control, story] of STEPS) {
    await control().click();
    await expect(s, what).toHaveAttribute('data-story', story);
    await walk(story);
  }
}

/**
 * What a frame of the panel gets wrong, as laid out: a page wider than the viewport, a badge or a day counter out of
 * the panel's content box, a playhead's pill that rises into the header, a gate's label that leaves the panel, does
 * not hang under the arch the thread draws (its centre within the label), or meets the playhead's pill or dot. Also
 * the header's height, which must not change from frame to frame: the thread under it must never move under a
 * finger. And the gate's labels, as counted.
 */
function panelFaults(page: Page): Promise<{ faults: string[]; head: number; gates: number }> {
  return stage(page).evaluate((s) => {
    const faults: string[] = [];
    const panel = s.querySelector('[data-part="stage"]') as HTMLElement;
    const css = getComputedStyle(panel);
    const p = panel.getBoundingClientRect();
    // The content box: inside the border and the padding.
    const left = p.left + Number.parseFloat(css.borderLeftWidth) + Number.parseFloat(css.paddingLeft);
    const right = p.right - Number.parseFloat(css.borderRightWidth) - Number.parseFloat(css.paddingRight);
    const box = (el: Element | null) => el?.getBoundingClientRect() ?? null;
    const day = s.querySelector('[data-testid="home-stage-day"]') as HTMLElement;
    const head = day.parentElement as HTMLElement;
    const width = document.documentElement.scrollWidth;
    if (width !== window.innerWidth) faults.push(`the page is ${width} px wide in ${window.innerWidth}`);
    for (const [what, el] of [
      ['the day', day],
      ['the badge', head.firstElementChild],
    ] as const) {
      const r = box(el);
      if (r && (r.left < left - 0.5 || r.right > right + 0.5))
        faults.push(
          `${what} spans ${r.left.toFixed(1)}–${r.right.toFixed(1)} in ${left.toFixed(1)}–${right.toFixed(1)}`,
        );
    }
    const pill = box(s.querySelector('[data-part="playhead"]'));
    const under = head.getBoundingClientRect().bottom;
    if (pill && pill.top < under - 0.5)
      faults.push(`the pill rises ${(under - pill.top).toFixed(1)} px into the header`);
    const label = box(s.querySelector('[data-part="gate-at"]'));
    const arch = box(s.querySelector('[data-part="stage"] [data-thread] [data-part="gate"]'));
    if (label) {
      if (label.left < left - 0.5 || label.right > right + 0.5) faults.push('the gate’s label leaves the panel');
      if (!arch) faults.push('a gate’s label with no gate');
      else {
        const x = arch.left + arch.width / 2;
        if (x < label.left || x > label.right) faults.push('the gate’s label is not under its arch');
        if (label.top < arch.bottom - 0.5 || label.top > arch.bottom + 4)
          faults.push(`the gate’s label stands ${(label.top - arch.bottom).toFixed(1)} px under its arch`);
      }
      for (const part of ['playhead', 'scrub-now']) {
        const r = box(s.querySelector(`[data-part="${part}"]`));
        if (r && r.left < label.right && label.left < r.right && r.top < label.bottom && label.top < r.bottom)
          faults.push(`the gate’s label meets the ${part}`);
      }
    }
    const gates = s.querySelectorAll('[data-part="gate-at"]').length;
    return { faults, head: Math.round(head.getBoundingClientRect().height * 10) / 10, gates };
  });
}

test('every frame of every story fits its panel and names its gate under the arch, from 320 px', async ({
  page,
  state,
}) => {
  test.setTimeout(300_000);
  const found: string[] = [];
  // 320 and 390: a phone's panel, the header on two lines; 482: the narrowest panel that puts it on one (26rem, its
  // padding, border and gutter); 1440.
  for (const lang of ['en', 'vi'] as const) {
    await page.goto(state.siteUrl);
    await setStoredLang(page, lang);
    for (const width of [320, 390, 482, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await loadStage(page);
      // The default story's thumb mid-track (day 116 of 233), where the wave and the pill ride highest, far from any
      // moment: a press there moves it.
      const slider = stage(page).getByTestId('home-stage-scrubber');
      await slider.scrollIntoViewIfNeeded();
      const b = await slider.boundingBox();
      if (!b) throw new Error('no Scrubber');
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await expect(stage(page)).toHaveAttribute('data-day', /^1[01]\d$/);
      for (const f of (await panelFaults(page)).faults) found.push(`${lang}, ${width} px, mid-track: ${f}`);
      const heads = new Set<number>();
      await eachFrame(page, async (story, row, rows) => {
        const { faults, head, gates } = await panelFaults(page);
        heads.add(head);
        for (const f of faults) found.push(`${lang}, ${width} px, ${story}, row ${row}: ${f}`);
        // One label a frame, the alarm's too; none on the last, where the playhead stands on the gate.
        if (gates !== (row === rows - 1 ? 0 : 1))
          found.push(`${lang}, ${width} px, ${story}, row ${row}: ${gates} gate labels`);
      });
      if (heads.size !== 1) found.push(`${lang}, ${width} px: the header is ${[...heads].join(', ')} px high`);
    }
  }
  await setStoredLang(page, 'en');
  expect([...new Set(found)]).toEqual([]);
});

/**
 * The lines of the stage's words that end at an ASCII hyphen, as laid out: Chromium may break after one, and a
 * line that ends in "check-" reads as a typo. Each caption, row and the vault's note is walked a character at a time.
 */
function hyphenEnds(page: Page): Promise<string[]> {
  return stage(page)
    .locator(
      '[data-testid="home-stage-caption"], [data-testid="home-stage-beats"] button, [data-testid="home-stage-about"]',
    )
    .evaluateAll((blocks) => {
      const out: string[] = [];
      for (const block of blocks) {
        const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let top: number | null = null;
        let last = '';
        let said = '';
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const text = n.textContent ?? '';
          for (let i = 0; i < text.length; i++) {
            range.setStart(n, i);
            range.setEnd(n, i + 1);
            const rect = range.getClientRects()[0];
            if (!rect) continue;
            if (top !== null && rect.top > top + 4 && last === '-')
              out.push(`${said.slice(-24)}⏎${text.slice(i, i + 8)}`);
            top = rect.top;
            last = text[i];
            said += text[i];
          }
        }
      }
      return out;
    });
}

test('no line of the stage ends at the hyphen of "check-in", in any story, at any width', async ({ page, state }) => {
  test.setTimeout(240_000);
  const found: string[] = [];
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(state.siteUrl);
    await loadStage(page);
    await eachFrame(page, async (story, row) => {
      for (const line of await hyphenEnds(page)) found.push(`${width} px, ${story}, row ${row}: ${line}`);
    });
  }
  expect([...new Set(found)]).toEqual([]);
});

test('the stage passes axe in both themes, before and after it loads', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  await expectAccessibleInBothThemes(page, stage(page));
  await loadStage(page);
  await expectAccessible(page);
});

test('at rest the day counter alone says the day: the pill shows only while the thumb is held or focused', async ({
  page,
  state,
}) => {
  // Fix round 4: the header's counter and the pill said "Day 0" twice in one panel. The pill keeps its box (opacity),
  // so the room above the thread and the checks of panelFaults still measure it.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(state.siteUrl);
    await stage(page).evaluate((el) => el.scrollIntoView());
    await loadStage(page);
    const thumb = stage(page).getByTestId('home-stage-scrubber-thumb-0');
    const pill = thumb.locator('[data-part="playhead"]');
    await expect(stage(page).getByTestId('home-stage-day'), `${width} px`).toHaveText('Day 0');
    await expect(pill, `${width} px: at rest`).toHaveCSS('opacity', '0');
    expect(await pill.boundingBox(), `${width} px: the pill's box at rest`).not.toBeNull();
    await thumb.focus();
    await expect(pill, `${width} px: focused`).toHaveCSS('opacity', '1');
    await expect(pill).toHaveText('Day 0');
    await stage(page).locator('input[value="inherit"]').focus();
    await expect(pill, `${width} px: blurred`).toHaveCSS('opacity', '0');
    // A press on the track mid-way, held: Radix focuses the thumb and moves it under the finger.
    const b = await stage(page).getByTestId('home-stage-scrubber').boundingBox();
    if (!b) throw new Error('no Scrubber');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect(pill, `${width} px: held`).toHaveCSS('opacity', '1');
    await expect(pill).toHaveText(/^Day\s1[01]\d$/);
    await page.mouse.up();
  }
});

test('screens of the stage, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(300_000);
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The first paint: the prerendered story at day 0, nothing loaded.
  await captureScreens(page, 'home-stage');
  // The alarm on day 180 on the Scrubber: a pressed row is intent.
  await captureScreens(page, 'home-stage-alarm', {
    ready: async (p) => {
      await stage(p).getByTestId('home-stage-beat-2').click();
      await expect(stage(p)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    },
  });
  // Recovery stopped by the owner on day 20.
  await captureScreens(page, 'home-stage-recover', {
    ready: async (p) => {
      await storyChip(p, 'recover').click();
      const back = stage(p).getByTestId('home-stage-back');
      // `has` is relative to the label: the test id alone, not the stage's locator.
      if (!(await back.isChecked()))
        await stage(p)
          .locator('label', { has: p.getByTestId('home-stage-back') })
          .click();
      await stage(p).getByTestId('home-stage-beat-3').click();
      await expect(stage(p)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
      await expect(stage(p)).toHaveAttribute('data-day', String(20));
    },
  });
  // Nobody confirms: the gate opens at the fallback, after 15 periods, in the released state.
  await captureScreens(page, 'home-stage-fallback', {
    ready: async (p) => {
      const confirm = stage(p).getByTestId('home-stage-confirm');
      await expect(confirm).toBeEnabled();
      if (await confirm.isChecked())
        await stage(p)
          .locator('label', { has: p.getByTestId('home-stage-confirm') })
          .click();
      await expect(stage(p)).toHaveAttribute('data-story', 'silent');
      await stage(p).getByTestId('home-stage-beat-3').click();
      await expect(stage(p)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
      await expect(stage(p)).toHaveAttribute('data-state', 'releasedInherit');
    },
  });
  // The simulator cannot load: the prerender stays, the footer says so and offers Try again. One shot per width,
  // without captureScreens: its reloads would fail with every chunk blocked.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(state.siteUrl);
    await hydrated(page);
    await page.route('**/_next/static/chunks/**', (r) => r.abort());
    await stage(page).getByTestId('home-stage-beat-2').click();
    await expect(stage(page)).toHaveAttribute('data-ready', 'error', { timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `test-results/screens/home-stage-failed/night-en-${width}.png`, fullPage: true });
    await page.unroute('**/_next/static/chunks/**');
  }
});

/** The blocks of the story after the hero, in order (src/app/page.tsx). */
const STORY = ['home-quiet1', 'stage', 'home-quiet2', 'trust', 'agent', 'rehearse'];
/** 2^26, every case of the policy circuit (CIRCUIT.cases, held to TOTAL_CASES by hero-eval.test.ts). */
const CASES = 2 ** 26;
const TOOLS = ['atropyle_check_plan', 'atropyle_simulate', 'atropyle_prepare_create_vault'];

/** Every text Say wrote in the story: shown when its lang is <html lang>, display: none otherwise. */
function storyLanguage(page: Page) {
  return page.locator('.story').evaluate((story) => {
    const lang = document.documentElement.lang;
    const spans = [...story.querySelectorAll<HTMLElement>('.say-en, .say-vi')];
    return {
      lang,
      count: spans.length,
      wrong: spans.filter((s) => s.checkVisibility() !== (s.lang === lang)).map((s) => `${s.lang}: ${s.textContent}`),
    };
  });
}

// (a)
test('after the stage the story reads in order, in the language of the page, and links where it says', async ({
  page,
  state,
}) => {
  await page.goto(state.siteUrl);
  // The stage stands in its island (src/home/stage-island.tsx), a box of `display: contents`: the story reads its scene.
  const ids = await page
    .locator('.story > *')
    .evaluateAll((els) =>
      els
        .map((e) => (e.id === 'stage-island' && e.firstElementChild ? e.firstElementChild : e))
        .map((e) => (e.getAttribute('data-testid')?.startsWith('home-quiet') ? e.getAttribute('data-testid') : e.id)),
    );
  expect(ids).toEqual(STORY);
  for (const lang of ['en', 'vi'] as const) {
    await setStoredLang(page, lang);
    const read = await storyLanguage(page);
    expect(read.lang).toBe(lang);
    expect(read.count).toBeGreaterThan(30);
    expect(read.wrong).toEqual([]);
    await expect(page.locator('#trust .trust-cases')).toHaveText(
      CASES.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN'),
      { useInnerText: true },
    );
  }
  await setStoredLang(page, 'en');
  await expect(page.getByTestId('home-agent-transcript').locator('code')).toHaveText(TOOLS);
  const install = page.getByTestId('home-agent-install');
  await expect(install).toHaveText(/^claude mcp add atropyle -- npx -y @atropyle\/mcp@\d+\.\d+\.\d+$/);
  await expect(install).toHaveCSS('user-select', 'all');
  for (const [block, href] of [
    ['trust', '/proof/#limits'],
    ['trust', '/proof/'],
    ['trust', '/status/'],
    ['agent', '/developers/'],
    ['rehearse', '/create/#drill'],
    ['rehearse', '/verify/'],
  ] as const) {
    await expect(page.locator(`#${block} a[href="${href}"]`), `${block} → ${href}`).toBeVisible();
  }
  await expect(page.locator('#rehearse a[href="/create/#drill"]')).toHaveAttribute('aria-describedby', 'rehearse-note');
  await expectAccessibleInBothThemes(page);
});

/** The names of the story's headings, one language each: the hidden language is display: none, so out of the name. */
const TITLES = {
  en: {
    '#trust-title': /^67,108,864\s+cases$/,
    '#agent-title': /^Plan in plain words\. Sign in your own wallet\.$/,
    '#rehearse-title': /^Rehearse it before it is real\.$/,
  },
  // \s: the Vietnamese copy glues words of two syllables with a no-break space.
  vi: {
    '#trust-title': /^67\.108\.864\s+trường\shợp$/,
    '#agent-title': /^Lập\skế\shoạch\sbằng\slời\sthường\.\sKý\sbằng\sví\scủa\schính\sbạn\.$/,
    '#rehearse-title': /^Diễn\stập\strước\skhi\slà\sthật\.$/,
  },
} as const;

// (a2)
test('switching to Vietnamese in the settings turns the whole story at once, with no reload, one language per name', async ({
  page,
  state,
}) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const [selector, name] of Object.entries(TITLES.en))
    await expect(page.locator(selector)).toHaveAccessibleName(name);
  // A mark on the window: a reload would drop it, so it proves the switch happens in place.
  await page.evaluate(() => {
    (window as Window & { __noReload?: boolean }).__noReload = true;
  });
  const settings = await openSettings(page);
  await settings.getByText('Tiếng Việt', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  // Close the popover or the sheet, so no modal hides the page from the accessibility tree.
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  expect(await page.evaluate(() => (window as Window & { __noReload?: boolean }).__noReload)).toBe(true);
  const read = await storyLanguage(page);
  expect(read.lang).toBe('vi');
  expect(read.count).toBeGreaterThan(30);
  expect(read.wrong).toEqual([]);
  for (const [selector, name] of Object.entries(TITLES.vi))
    await expect(page.locator(selector)).toHaveAccessibleName(name);
  // Back to English the same way, so the next test starts from the default. The header speaks Vietnamese now, and
  // openSettings looks for the English "Settings": on a wide screen the button and its popover are "Cài đặt" (the
  // phone's "Menu" is the same word in both languages).
  const wide = page.getByRole('button', { name: 'Cài đặt' });
  if (await wide.isVisible()) await wide.click();
  else await page.getByRole('button', { name: 'Menu' }).click();
  const again = page.getByRole('dialog', { name: /^(?:Cài đặt|Menu)$/ });
  await again.getByText('English', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await storyLanguage(page)).wrong).toEqual([]);
});

// (b)
test('the story fits every width from 320 px in both languages: no sideways scroll, the number on one line', async ({
  page,
  state,
}) => {
  await page.goto(state.siteUrl);
  for (const lang of ['en', 'vi'] as const) {
    await setStoredLang(page, lang);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const at = `${lang} ${width} px`;
      expect(await page.evaluate(() => document.documentElement.scrollWidth), at).toBe(width);
      const number = await page
        .locator('#trust .trust-cases')
        .evaluate((n) => ({ sw: n.scrollWidth, cw: n.clientWidth }));
      expect(number.sw, at).toBeLessThanOrEqual(number.cw);
      const out = await page.locator('.story').evaluate((story) =>
        [...story.querySelectorAll('a, code, h2, p')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.left < -0.5 || r.right > window.innerWidth + 0.5);
          })
          .map((e) => e.textContent),
      );
      expect(out, at).toEqual([]);
    }
  }
  await setStoredLang(page, 'en');
});

/** The spine in page pixels: each piece's centre line and extent, each node's centre, its anchor's first line and edge. */
function spine(page: Page) {
  return page.locator('.story').evaluate((story) => {
    const y0 = window.scrollY;
    const segs = [...story.querySelectorAll<HTMLElement>('.spine-seg')].map((s) => {
      const r = s.getBoundingClientRect();
      return {
        shown: getComputedStyle(s).display !== 'none',
        x: r.left + r.width / 2,
        top: r.top + y0,
        bottom: r.bottom + y0,
      };
    });
    const nodes = [...story.querySelectorAll<HTMLElement>('.spine-node')].map((n) => {
      const r = n.getBoundingClientRect();
      const anchor = n.parentElement as HTMLElement;
      const a = anchor.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(anchor);
      // The anchor's first line box: the node is absolute, left of the anchor, and so outside every line.
      const line =
        [...range.getClientRects()]
          .filter((q) => q.width > 0 && q.left >= a.left - 0.5)
          .sort((p, q) => p.top - q.top)[0] ?? a;
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2 + y0,
        right: r.right,
        lineTop: line.top + y0,
        lineBottom: line.bottom + y0,
        textLeft: a.left,
      };
    });
    return { segs, nodes };
  });
}

// (c)
test('from 78rem the spine runs down one line beside every block, a node on each first line, never under text', async ({
  page,
  state,
}) => {
  // Reduced motion: no rise, so every anchor stands where it is laid out.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(state.siteUrl);
  for (const width of [1248, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { segs, nodes } = await spine(page);
    expect(segs).toHaveLength(STORY.length);
    expect(nodes).toHaveLength(STORY.length);
    const x = segs[0].x;
    // In the gutter, 1.5rem left of the box, and never nearer the screen's edge than the page's own 1.5rem.
    expect(x, `${width} px`).toBeGreaterThanOrEqual(23.5);
    for (const [i, s] of segs.entries()) {
      const at = `${width} px, piece ${i}`;
      expect(s.shown, at).toBe(true);
      expect(Math.abs(s.x - x), at).toBeLessThanOrEqual(0.5);
      if (i > 0) expect(Math.abs(s.top - segs[i - 1].bottom), at).toBeLessThanOrEqual(1);
    }
    for (const [i, n] of nodes.entries()) {
      const at = `${width} px, node ${i}`;
      expect(Math.abs(n.x - x), at).toBeLessThanOrEqual(1);
      expect(n.y, at).toBeGreaterThanOrEqual(n.lineTop - 0.5);
      expect(n.y, at).toBeLessThanOrEqual(n.lineBottom + 0.5);
      expect(n.right, at).toBeLessThanOrEqual(n.textLeft - 4);
    }
    // The line ends at the closing scene's node.
    expect(Math.abs((segs.at(-1)?.bottom ?? 0) - (nodes.at(-1)?.y ?? 0)), `${width} px`).toBeLessThanOrEqual(1.5);
  }
  // Narrower there is no gutter: the line would sit at the screen's edge, so it does not show (fix round 1).
  for (const width of [390, 768, 1024, 1247]) {
    await page.setViewportSize({ width, height: 900 });
    const { segs } = await spine(page);
    expect(
      segs.some((s) => s.shown),
      `${width} px`,
    ).toBe(false);
  }
});

/** The vertical scale of an element's transform, 1 for none. */
const scaleOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).d);

// (d)
test('the spine fills as the reader scrolls, by transform alone, and stands full without motion', async ({
  page,
  state,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(state.siteUrl);
  // At the top the trust band is far below: its piece is empty, its node untied.
  await expect.poll(() => scaleOf(page, '#trust .spine-fill')).toBeLessThan(0.01);
  await expect.poll(() => scaleOf(page, '#trust .spine-node > span')).toBeLessThan(0.01);
  await page.locator('#trust').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await expect.poll(() => scaleOf(page, '#trust .spine-fill')).toBeGreaterThan(0.2);
  expect(await scaleOf(page, '#trust .spine-fill')).toBeLessThan(0.95);
  await expect.poll(() => scaleOf(page, '#trust .spine-node > span')).toBe(1);
  await expect.poll(() => scaleOf(page, '[data-testid="home-quiet2"] .spine-fill')).toBe(1);
  // What moves, moves by transform alone (R18.4).
  const props = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a instanceof CSSAnimation && /^(?:spine|story)-/.test(a.animationName))
      .flatMap((a) =>
        (a.effect as KeyframeEffect)
          .getKeyframes()
          .flatMap((k) =>
            Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p)),
          ),
      ),
  );
  expect([...new Set(props)]).toEqual(['transform']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  for (const selector of ['#trust .spine-fill', '#trust .spine-node > span', '#rehearse .spine-fill', '#trust-title']) {
    await expect
      .poll(
        () =>
          page
            .locator(selector)
            .first()
            .evaluate((e) => getComputedStyle(e).transform),
        selector,
      )
      .toBe('none');
  }
});

// (e)
test('reading down the whole page moves no layout: the spine, the rise and the bands shift nothing', async ({
  page,
  state,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(state.siteUrl);
    // After the fonts: the fallback's shift on load is ruling R-T6-8's, not this test's.
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await settle(page);
    const before = await layoutShift(page);
    await page.mouse.move(width / 2, 450);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 500);
    await expect(page.locator('#rehearse')).toBeInViewport();
    await settle(page);
    expect(await layoutShift(page), `${width} px`).toBeLessThanOrEqual(before);
  }
});

// (f)
test('screens of the story after the stage, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The spec's whole gate (§11): 390, 768 and 1440 px, night and vellum, English and Vietnamese. Vellum is the brand
  // since 26 Nov; the app boots night until 7C T12, so both must hold.
  await captureScreens(page, 'home-story', { shots: FULL_MATRIX });
  // The spine mid-read. A full-page shot does not scroll, so its scroll timelines show the top of the page: these are
  // viewport shots with the trust band in the middle.
  await setStoredTheme(page, 'light');
  for (const width of [1440, 1280, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#trust').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await settle(page);
    await page.screenshot({ path: `test-results/screens/home-spine/vellum-en-${width}.png` });
  }
  await setStoredTheme(page, 'dark');
});
