import type { Locator, Page } from '@playwright/test';
import type { Address } from 'viem';
import { ANVIL, expect, test } from './fixtures.ts';
import { connectFrom } from './flows.ts';
import { expectAccessible, expectAccessibleInBothThemes, setStoredLang, setStoredTheme, settle } from './helpers.ts';
import { captureScreens, FULL_MATRIX, type Shot, shouldCapture } from './screens.ts';

const OWNER = ANVIL[1];
const HEIR = ANVIL[2];
const GUARDIAN = ANVIL[3];
const methods = (w: { calls: { method: string }[] }) => w.calls.map((c) => c.method);
/** A sr-only radio is pressed through its label (7B-T5 ruling b). */
const pick = (page: Page, id: string) => page.locator('label', { has: page.getByTestId(id) }).click();
const ready = (page: Page) => expect(page.getByTestId('create')).toHaveAttribute('data-ready', 'true');
async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

// The leave guard asks before every reload past the first step (captureScreens and the a11y helper reload).
test.beforeEach(({ page }) => {
  page.on('dialog', (d) => {
    d.accept().catch(() => undefined);
  });
});

test('a Drill is created through wallet_sendCalls', async ({ page, state, atro, wallet }, info) => {
  const token = atro.deployment.feeTokens[0] as Address;
  const w = await wallet({ account: OWNER, sendCalls: true });
  await page.goto(`${state.siteUrl}create/#drill`);
  await ready(page);
  const wizard = page.getByTestId('create');
  await expect(wizard).toHaveAttribute('data-step', 'kind');
  await expect(page.getByTestId('create-kind-drill')).toBeChecked();
  await page.getByTestId('create-next').click();

  await page.getByTestId('create-next').click();
  await expect(page.getByTestId('create-issues')).not.toHaveAttribute('data-count', '0');
  await expectAccessibleInBothThemes(page);
  await page.getByTestId('create-heir-0-account').fill(HEIR);
  await page.getByTestId('create-next').click();
  await expect(page.getByTestId('create-guardians-none')).toBeChecked();
  await page.getByTestId('create-next').click();
  await expect(page.getByTestId('create-preset-drill')).toBeChecked();
  // The devnet has no netlist: the preview runs on the SDK's model engine (Quyết định 14).
  await expect(page.getByTestId('time-machine')).toHaveAttribute('data-engine', 'model');
  await page.getByTestId('create-next').click();

  await page.getByTestId('create-token-0').click();
  await expect(page.getByTestId('create-asset-0-token')).toHaveValue(token);
  await page.getByTestId('create-next').click();
  await expect(wizard).toHaveAttribute('data-step', 'review');
  // Before any wallet: the summary names the asset the vault may move, in full.
  await expect(page.getByTestId('create-sum-asset-0')).toContainText('Token');
  await expectAccessibleInBothThemes(page, page.getByTestId('create-connect'));

  await connectFrom(page, page.getByTestId('create-connect'));
  await expect(page.getByTestId('create-checked')).toBeVisible();
  await expect(page.getByTestId('create-warning-DRILL_NOT_FOR_REAL_ASSETS')).toContainText('practice');
  await page.getByTestId('create-prepare').click();
  await expect(page.getByTestId('create-tx-irreversible-0')).toBeVisible();
  await expectAccessible(page);
  // The predicted vault signs the preview's thread before anything is sent.
  if (info.project.name === 'desktop') {
    await expect(page.getByTestId('create-preview-thread').locator('[data-thread]')).toHaveAttribute(
      'data-signed',
      'true',
    );
    // The words under the gate never widen the Thread past the rail.
    const rail = await box(page.getByTestId('create-preview'));
    const drawn = await box(page.getByTestId('create-preview-thread').locator('[data-thread]'));
    expect(drawn.x + drawn.width).toBeLessThanOrEqual(rail.x + rail.width);
    // In the rail the plan is 4:1, with 6 px of air before the figure's edge for the branches' end dots.
    expect(drawn.width / drawn.height).toBeCloseTo(4, 1);
    const figure = await box(page.getByTestId('create-preview-thread'));
    expect(figure.x + figure.width - (drawn.x + drawn.width)).toBeGreaterThanOrEqual(5.5);
    // The gate stands at two thirds, as on the home thread.
    const gate = await box(page.getByTestId('create-preview-thread').locator('[data-part="gate"]'));
    expect((gate.x + gate.width / 2 - drawn.x) / drawn.width).toBeCloseTo(2 / 3, 1);
  } else {
    await expect(page.getByTestId('create-strip').locator('[data-thread]')).toHaveAttribute('data-signed', 'true');
  }
  await page.getByTestId('create-tx-send').click();

  const done = page.getByTestId('create-done');
  await expect(done).toBeVisible();
  expect(methods(w)).toContain('wallet_sendCalls');
  expect(methods(w)).not.toContain('eth_sendTransaction');
  const vault = (await done.getAttribute('data-vault')) as Address;
  const cfg = await atro.vault(vault).config();
  expect(cfg).toMatchObject({
    owner: OWNER,
    drill: true,
    k: 0,
    recoveryEnabled: false,
    guardians: [],
    heirs: [{ account: HEIR, bps: 10_000 }],
    timing: { period: 60, threshold: 2, window: 120 },
  });
  expect(cfg.assets).toEqual([{ kind: 'erc20', token, id: 0n, heir: 0 }]);
  const status = await atro.vault(vault).status();
  expect(status.assets[0]?.coverage).toBe(status.assets[0]?.held);
  await expect(page.getByTestId('create-done-thread').locator('[data-thread]')).toHaveAttribute('data-signed', 'true');
  await expect(page.getByTestId('create-done-thread-signed')).toBeVisible();
  await expect(page.getByTestId('create-invite-heir')).toContainText(`/join/#${vault}.heir`);
  await expect(page.getByTestId('create-invite-guardian')).toHaveCount(0);
  // A lone heirs card spans the page, and the restart button closes it, aligned to the page's edge.
  const page0 = await box(done);
  expect((await box(page.getByTestId('create-invite-heir'))).width).toBeGreaterThan(page0.width * 0.9);
  expect(Math.abs((await box(page.getByTestId('create-restart'))).x - page0.x)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('create-open-vault')).toHaveAttribute('href', new RegExp(`/vault/#${vault}$`));
  await expectAccessibleInBothThemes(page, page.getByTestId('create-done'));
});

test('a real vault pays its fee and is signed one step at a time', async ({ page, state, atro, wallet }, info) => {
  const fee = atro.deployment.feeTokens[0] as Address;
  const w = await wallet({ account: OWNER });
  await page.goto(`${state.siteUrl}create/#real`);
  await ready(page);
  await expect(page.getByTestId('create-kind-real')).toBeChecked();
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-heir-0-account').fill(HEIR);
  await page.getByTestId('create-add-heir').click();
  await page.getByTestId('create-heir-1-account').fill(ANVIL[4]);
  await expect(page.getByTestId('create-shares-percent-0')).toHaveValue('50');
  await page.getByTestId('create-shares-thumb-0').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('create-shares-percent-0')).toHaveValue('51');
  await page.getByTestId('create-next').click();
  await expect(page.getByTestId('create-guardians-with')).toBeChecked();
  await page.getByTestId('create-guardian-0').fill(GUARDIAN);
  if (info.project.name === 'desktop') {
    // The guardians' posts stand under an arch tall enough to read as posts in the rail.
    const thread = page.getByTestId('create-preview-thread');
    await expect(thread.locator('[data-part="post"]')).toHaveCount(1);
    expect((await box(thread.locator('[data-part="gate"]'))).height).toBeGreaterThanOrEqual(47);
    expect((await box(thread.locator('[data-part="posts"]'))).height).toBeGreaterThanOrEqual(14);
  }
  await page.getByTestId('create-next').click();
  await expect(page.getByTestId('create-preset-sixMonths')).toBeChecked();
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-next').click();

  await connectFrom(page, page.getByTestId('create-connect'));
  await expect(page.getByTestId(`create-fee-${fee.toLowerCase()}`)).toBeChecked();
  await page.getByTestId('create-prepare').click();
  await expect(page.getByTestId('create-tx-step-0')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('create-tx-irreversible-1')).toBeVisible();
  await page.getByTestId('create-tx-send').click();
  const done = page.getByTestId('create-done');
  await expect(done).toBeVisible();
  expect(methods(w).filter((m) => m === 'eth_sendTransaction')).toHaveLength(2);
  const vault = (await done.getAttribute('data-vault')) as Address;
  expect(await atro.vault(vault).config()).toMatchObject({
    drill: false,
    guardians: [GUARDIAN],
    k: 1,
    heirs: [
      { account: HEIR, bps: 5_100 },
      { account: ANVIL[4], bps: 4_900 },
    ],
    timing: { period: 2_592_000, threshold: 6, window: 1_209_600 },
  });
  await expect(page.getByTestId('create-invite-guardian')).toContainText(`/join/#${vault}.guardian`);
});

test('the strip at 390 covers no input and hides while one has focus', async ({ page, state }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${state.siteUrl}create/#drill`);
  await ready(page);
  await page.getByTestId('create-next').click();
  const strip = page.getByTestId('create-strip');
  await expect(strip).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const dock = await box(page.getByTestId('create-dock'));
  const last = await box(page.getByTestId('create-add-heir'));
  expect(last.y + last.height).toBeLessThanOrEqual(dock.y);
  const input = page.getByTestId('create-heir-0-account');
  await input.focus();
  await expect(strip).toBeHidden();
  await input.blur();
  await expect(strip).toBeVisible();
  await page.getByTestId('create-preview-open').click();
  await expect(page.getByTestId('create-preview-sheet')).toBeVisible();
  await expect(page.getByTestId('create-sheet-thread').locator('[data-thread]')).toHaveAttribute('role', 'img');
});

// The strip's Thread is a simpler drawing (no recovery exit, no posts, no branch ends, three heirs at most) in a box
// large enough to read: at 112 x 22 px the exit's end crashed into the gate and the gate shrank to a glyph.
test('the strip Thread reads at 390 and 768: tall enough, nothing on the gate', async ({ page, state }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${state.siteUrl}create/#real`);
  await ready(page);
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-heir-0-account').fill(HEIR);
  for (let i = 0; i < 3; i++) await page.getByTestId('create-add-heir').click();
  await page.getByTestId('create-heir-1-account').fill(ANVIL[4]);
  await page.getByTestId('create-heir-2-account').fill(ANVIL[5]);
  await page.getByTestId('create-heir-3-account').fill(ANVIL[6]);
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-guardian-0').fill(GUARDIAN);
  await page.getByTestId('create-add-guardian').click();
  await page.getByTestId('create-guardian-1').fill(ANVIL[7]);
  await pick(page, 'create-recovery');
  await page.locator('#create-step-title').focus();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const strip = page.getByTestId('create-strip');
    await expect(strip).toBeVisible();
    const thread = strip.locator('[data-thread]');
    const t = await box(thread);
    const s = await box(strip);
    expect(t.height, `${width}: the Thread's height`).toBeGreaterThanOrEqual(40);
    // At least 4 px of air above and below, inside the strip's 1 px bottom border.
    expect(t.y - s.y, `${width}: air above`).toBeGreaterThanOrEqual(4);
    expect(s.y + s.height - 1 - (t.y + t.height), `${width}: air below`).toBeGreaterThanOrEqual(4);
    // The words keep their room: the label ends before the chevron.
    const words = await box(page.getByTestId('create-preview-open').locator('span.grow'));
    expect(words.width, `${width}: room for the words`).toBeGreaterThanOrEqual(120);
    // Four heirs, three branches; the gate an arch, not a glyph.
    await expect(thread.locator('[data-part="branch"]')).toHaveCount(3);
    const gate = await box(thread.locator('[data-part="gate"]'));
    expect(gate.height, `${width}: the gate's height`).toBeGreaterThanOrEqual(18);
    // No end of the recovery exit or of a heir's branch on the gate (the strip draws none of them).
    const marks = await thread.locator('[data-part="exit-end"], [data-part="dot"]').all();
    for (const mark of marks) {
      const m = await box(mark);
      const apart =
        m.x + m.width <= gate.x ||
        gate.x + gate.width <= m.x ||
        m.y + m.height <= gate.y ||
        gate.y + gate.height <= m.y;
      expect(apart, `${width}: a mark on the gate`).toBe(true);
    }
    await expect(thread.locator('[data-part="exit"], [data-part="posts"], [data-part="dot"]')).toHaveCount(0);
  }
});

// WCAG 2.2 2.4.11: below lg the fixed dock covers the bottom of the screen, and the browser leaves a field it covers
// where it is unless scroll-padding reserves the dock (globals.css). Keyboard only, from the h1 to Next.
test('at 390 the dock and the header never hide the field that has focus', async ({ page, state }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto(`${state.siteUrl}create/#drill`);
  await ready(page);
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-heir-0-account').fill(HEIR);
  await page.getByTestId('create-add-heir').click();
  await page.getByTestId('create-add-heir').click();
  await page.getByTestId('create-heir-1-account').fill(ANVIL[4]);
  await page.getByTestId('create-heir-2-account').fill(ANVIL[5]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#create-step-title').focus();
  const hidden: string[] = [];
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab');
    const seen = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const dock = document.querySelector('[data-testid="create-dock"]');
      const header = document.querySelector('header');
      if (!el || !dock || !header) return null;
      const r = el.getBoundingClientRect();
      const d = dock.getBoundingClientRect();
      const h = header.getBoundingClientRect();
      const name = el.dataset.testid ?? el.id ?? el.tagName;
      // Both bars span the width: a field is hidden when no part of it shows between them.
      const covered = !dock.contains(el) && (r.top >= d.top || r.bottom <= h.bottom);
      return { name, covered, next: el.dataset.testid === 'create-next' };
    });
    if (!seen) throw new Error('no focus');
    if (seen.covered) hidden.push(seen.name);
    reached = seen.next;
  }
  expect(reached).toBe(true);
  expect(hidden).toEqual([]);
});

test('leaving mid-wizard asks first', async ({ page, state }) => {
  await page.goto(`${state.siteUrl}create/#drill`);
  await ready(page);
  await page.getByTestId('create-next').click();
  await expect(page.getByTestId('create')).toHaveAttribute('data-step', 'heirs');
  const asked = page.waitForEvent('dialog');
  void page.reload().catch(() => undefined);
  expect((await asked).type()).toBe('beforeunload');
});

// Review Focus 1: a plan is never signed for a different form, even when the edit comes through the hash.
/** A Drill prepared on the review step, then back on the first step: the wallet has not seen the plan. */
async function preparedThenKind(page: Page, siteUrl: string) {
  await page.goto(`${siteUrl}create/#drill`);
  await ready(page);
  const wizard = page.getByTestId('create');
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-heir-0-account').fill(HEIR);
  // heirs → guardians → timing → assets
  for (let i = 0; i < 3; i++) await page.getByTestId('create-next').click();
  await expect(wizard).toHaveAttribute('data-step', 'assets');
  await page.getByTestId('create-token-0').click();
  await page.getByTestId('create-next').click();
  await expect(wizard).toHaveAttribute('data-step', 'review');
  await connectFrom(page, page.getByTestId('create-connect'));
  await page.getByTestId('create-prepare').click();
  await expect(page.getByTestId('create-tx')).toBeVisible();
  // The wallet has not seen the plan: the steps before are still open.
  await page.getByTestId('create-progress-kind').getByRole('button').click();
  await expect(wizard).toHaveAttribute('data-step', 'kind');
}
const setHash = (page: Page, hash: string) =>
  page.evaluate((h) => {
    window.location.hash = h;
  }, hash);

test('a kind change through the hash alone drops the plan', async ({ page, state, wallet }) => {
  await wallet({ account: OWNER, sendCalls: true });
  await preparedThenKind(page, state.siteUrl);
  const wizard = page.getByTestId('create');
  // Real and back to Drill through the hash only: the form ends where it was, but the plan was dropped on the way.
  await setHash(page, '#real');
  await expect(page.getByTestId('create-kind-real')).toBeChecked();
  await setHash(page, '#drill');
  await expect(page.getByTestId('create-kind-drill')).toBeChecked();
  // kind → heirs → guardians → timing → assets → review, with no edit on the way (no setForm call).
  for (let i = 0; i < 5; i++) await page.getByTestId('create-next').click();
  await expect(wizard).toHaveAttribute('data-step', 'review');
  await expect(page.getByTestId('create-tx')).toHaveCount(0);
  await expect(page.getByTestId('create-resume-failed')).toHaveCount(0);
  await expect(page.getByTestId('create-prepare')).toBeVisible();
});

test('an edit after prepare drops the plan', async ({ page, state, wallet }) => {
  await wallet({ account: OWNER, sendCalls: true });
  await preparedThenKind(page, state.siteUrl);
  const wizard = page.getByTestId('create');
  await setHash(page, '#real');
  await expect(page.getByTestId('create-kind-real')).toBeChecked();
  // kind → heirs (kept) → guardians; a real vault starts guarded, so pick none
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-next').click();
  await expect(wizard).toHaveAttribute('data-step', 'guardians');
  await pick(page, 'create-guardians-none');
  // guardians → timing → assets (kept) → review
  for (let i = 0; i < 3; i++) await page.getByTestId('create-next').click();
  await expect(wizard).toHaveAttribute('data-step', 'review');
  await expect(page.getByTestId('create-tx')).toHaveCount(0);
  await expect(page.getByTestId('create-resume-failed')).toHaveCount(0);
  await expect(page.getByTestId('create-prepare')).toBeVisible();
});

test('the nav reaches /create/ inside a view transition', async ({ page, state }, info) => {
  test.skip(info.project.name !== 'desktop', 'the header nav shows from 48rem');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(state.siteUrl);
  await settle(page);
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
  await page.locator('header nav a[href$="/create/"]').first().click();
  await page.waitForURL(/\/create\/(#drill)?$/);
  await expect(page.getByTestId('create')).toBeVisible();
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __vtCalls?: number; __sameDocument?: boolean };
    return { sameDocument: w.__sameDocument === true, calls: w.__vtCalls ?? 0 };
  });
  expect(seen.sameDocument).toBe(true);
  expect(seen.calls).toBeGreaterThan(0);
});

test('screens of the wizard', async ({ page, state, wallet }, info) => {
  test.skip(!shouldCapture(info.project.name), 'SCREENS=1 only');
  // Twelve shots per screen (both themes, both languages, 390, 768 and 1440 px), each a reload.
  test.setTimeout(45 * 60_000);
  // From the top: the h1 takes focus on a new step and scrolls, and a full-page shot then paints the sticky header
  // over the progress line.
  const top = async () => {
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  const all = { shots: FULL_MATRIX, ready: top };
  const phones: readonly Shot[] = FULL_MATRIX.filter((s) => s.width < 1024);
  await wallet({ account: OWNER, sendCalls: true });
  await page.goto(`${state.siteUrl}create/#real`);
  await ready(page);
  await captureScreens(page, 'create-kind', all);
  await page.getByTestId('create-next').click();
  // Next on an empty step: the issue list above the fields (it comes back after each reload of the shots).
  await captureScreens(page, 'create-heirs-issues', {
    shots: FULL_MATRIX.filter((s) => s.width !== 768),
    ready: async () => {
      await ready(page);
      if ((await page.getByTestId('create-issues').getAttribute('data-count')) === '0') {
        await page.getByTestId('create-next').click();
      }
      await expect(page.getByTestId('create-issues')).not.toHaveAttribute('data-count', '0');
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  });
  await page.getByTestId('create-heir-0-account').fill(HEIR);
  await page.getByTestId('create-add-heir').click();
  await page.getByTestId('create-add-heir').click();
  await page.getByTestId('create-heir-1-account').fill(ANVIL[4]);
  await page.getByTestId('create-heir-2-account').fill(ANVIL[5]);
  await captureScreens(page, 'create-heirs', all);
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-guardian-0').fill(GUARDIAN);
  await page.getByTestId('create-add-guardian').click();
  await page.getByTestId('create-guardian-1').fill(ANVIL[6]);
  await pick(page, 'create-recovery');
  await captureScreens(page, 'create-guardians', all);
  await page.getByTestId('create-next').click();
  await captureScreens(page, 'create-timing', all);
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-token-0').click();
  await captureScreens(page, 'create-assets', all);
  await page.getByTestId('create-next').click();
  await captureScreens(page, 'create-review', all);
  await captureScreens(page, 'create-sheet', {
    shots: phones,
    ready: async () => {
      await ready(page);
      if (!(await page.getByTestId('create-preview-sheet').isVisible())) {
        await page.getByTestId('create-preview-open').click();
      }
      await expect(page.getByTestId('create-preview-sheet')).toBeVisible();
    },
  });
  // A connected review, checked on chain: one shot in each theme here, without the reloads that drop the wallet.
  await page.setViewportSize({ width: 1440, height: 900 });
  await connectFrom(page, page.getByTestId('create-connect'));
  await expect(page.getByTestId('create-checked')).toBeVisible();
  await settle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/screens/create-review-checked/night-en-1440.png', fullPage: true });

  // A Drill to reach the done screen: a fresh session, since the session wins over the hash (Ruling 9).
  // Leave the page first: a goto that only changes the hash would let the wizard write its kind back.
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto('about:blank');
  await page.goto(`${state.siteUrl}create/#drill`);
  await ready(page);
  await expect(page.getByTestId('create-kind-drill')).toBeChecked();
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-heir-0-account').fill(HEIR);
  for (let i = 0; i < 3; i++) await page.getByTestId('create-next').click();
  await page.getByTestId('create-token-0').click();
  await page.getByTestId('create-next').click();
  await expect(page.getByTestId('create')).toHaveAttribute('data-step', 'review');
  if (await page.getByTestId('create-connect').isVisible()) {
    await connectFrom(page, page.getByTestId('create-connect'));
  }
  await page.getByTestId('create-prepare').click();
  await expect(page.getByTestId('create-tx-irreversible-0')).toBeVisible();
  await settle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/screens/create-prepared/night-en-1440.png', fullPage: true });
  await page.getByTestId('create-tx-send').click();
  await expect(page.getByTestId('create-done')).toBeVisible();
  await captureScreens(page, 'create-done', {
    shots: FULL_MATRIX,
    ready: async () => {
      await expect(page.getByTestId('create-done')).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  });
});

/** The preview's shots (7B-T7f): Vellum in English and Vietnamese, Night in English, at 390, 768 and 1440 px. */
const PREVIEW_SHOTS: readonly Shot[] = (
  [
    ['light', 'en'],
    ['light', 'vi'],
    ['dark', 'en'],
  ] as const
).flatMap(([theme, lang]) => [390, 768, 1440].map((width): Shot => ({ theme, lang, width })));

/**
 * The preview of the step on screen, into test-results/screens/create-preview-<step>/: below lg the dock (the strip
 * over Back and Next) and its open sheet, from lg the rail. Ends in night and English, at the viewport it started with.
 */
async function capturePreview(page: Page, step: string): Promise<void> {
  const start = page.viewportSize();
  let theme: Shot['theme'] | null = null;
  let lang: Shot['lang'] | null = null;
  for (const shot of PREVIEW_SHOTS) {
    if (shot.theme !== theme) {
      await setStoredTheme(page, shot.theme);
      theme = shot.theme;
    }
    if (shot.lang !== lang) {
      await setStoredLang(page, shot.lang);
      lang = shot.lang;
    }
    await page.setViewportSize({ width: shot.width, height: 900 });
    await ready(page);
    await expect(page.getByTestId('create')).toHaveAttribute('data-step', step);
    await settle(page);
    const path = `test-results/screens/create-preview-${step}/${shot.theme === 'dark' ? 'night' : 'vellum'}-${shot.lang}-${shot.width}`;
    if (shot.width < 1024) {
      // A field with focus hides the strip: the shot is of a person who has just arrived on the step.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page.getByTestId('create-strip')).toBeVisible();
      await page.getByTestId('create-dock').screenshot({ path: `${path}-strip.png` });
      await page.getByTestId('create-preview-open').click();
      await expect(page.getByTestId('create-preview-sheet')).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${path}-sheet.png` });
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('create-preview-sheet')).toBeHidden();
    } else {
      await page.getByTestId('create-preview').screenshot({ path: `${path}-rail.png` });
    }
  }
  await setStoredLang(page, 'en');
  await setStoredTheme(page, 'dark');
  if (start) await page.setViewportSize(start);
}

test('preview screens of every step', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'SCREENS=1 only');
  test.setTimeout(20 * 60_000);
  await page.goto(`${state.siteUrl}create/#real`);
  await ready(page);
  await capturePreview(page, 'kind');
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-heir-0-account').fill(HEIR);
  for (let i = 0; i < 3; i++) await page.getByTestId('create-add-heir').click();
  await page.getByTestId('create-heir-1-account').fill(ANVIL[4]);
  await page.getByTestId('create-heir-2-account').fill(ANVIL[5]);
  await page.getByTestId('create-heir-3-account').fill(ANVIL[6]);
  await capturePreview(page, 'heirs');
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-guardian-0').fill(GUARDIAN);
  await page.getByTestId('create-add-guardian').click();
  await page.getByTestId('create-guardian-1').fill(ANVIL[7]);
  await pick(page, 'create-recovery');
  await capturePreview(page, 'guardians');
  await page.getByTestId('create-next').click();
  await capturePreview(page, 'timing');
  await page.getByTestId('create-next').click();
  await page.getByTestId('create-token-0').click();
  await capturePreview(page, 'assets');
  await page.getByTestId('create-next').click();
  await capturePreview(page, 'review');
});
