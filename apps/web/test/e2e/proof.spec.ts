import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { expectAccessible, expectAccessibleInBothThemes, openSettings, setStoredLang } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';

const XLAYER = JSON.parse(readFileSync(new URL('../../../../deployments/xlayer.json', import.meta.url), 'utf8')) as {
  circuits: { netlistKeccak: { policy: string } };
};
const KECCAK = XLAYER.circuits.netlistKeccak.policy;
/** All 2^26 cases in the production worker: about 20 s on a laptop, a few minutes on a loaded machine. */
const FULL_RUN_MS = 300_000;
const ROWS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const;
const PLATE = 1024 * 1024;
/** PROOF_BLOCKS of src/proof/paint.ts: blocks of 32 cases in the full proof. */
const FULL_BLOCKS = 2 ** 21;

/** The phone of R18.13's shots. */
const PHONE = { width: 390, height: 844 };

const proofUrl = (siteUrl: string) => new URL('proof/', siteUrl).href;
const harnessUrl = (siteUrl: string, hash = '') => new URL(`e2e/proof/${hash}`, siteUrl).href;

/** True when the page is wider than the window: a reader on a 390 px phone would scroll sideways. */
const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** A passed full proof, every row lit (the stagger takes about 1.3 s). */
async function passed(page: Page): Promise<void> {
  await expect(page.getByTestId('proof-verdict')).toHaveAttribute('data-ok', 'true', { timeout: FULL_RUN_MS });
  await expect(page.getByTestId('proof-verdict')).toHaveAttribute('data-full', 'true');
  for (const row of ROWS) await expect(page.getByTestId(`proof-prop-${row}`)).toHaveAttribute('data-state', 'holds');
}

test('/proof/ on the devnet reads, passes axe in both themes, and a run ends in the typed error', async ({
  page,
  state,
}) => {
  await page.goto(proofUrl(state.siteUrl));
  const h1 = page.getByRole('heading', { level: 1, name: 'Every case, checked in your browser' });
  await expect(h1).toBeVisible();
  await expect(page.locator('#limits').getByTestId('proof-limit')).toHaveCount(6);
  for (const row of ROWS) await expect(page.getByTestId(`proof-prop-${row}`)).toHaveAttribute('data-state', 'pending');
  await expect(page.getByTestId('proof-seal')).toHaveAttribute('data-match', 'pending');
  await expectAccessibleInBothThemes(page, h1);
  await page.getByTestId('proof-start').click();
  // The devnet processor holds no netlist (tapeout: null): the SDK refuses the bundle before any enumeration.
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'POLICY_UNAVAILABLE');
  const run = page.getByTestId('proof-run');
  await expect(run).toHaveAttribute('data-status', 'error');
  await expect(run).toHaveAttribute('data-wake', 'off');
  await expect(page.getByTestId('proof-verdict')).toHaveCount(0);
  await expect(page.getByTestId('proof-certificate')).toHaveCount(0);
});

test('at 390 px the Run button is on the first screen, and nothing scrolls sideways', async ({ page, state }) => {
  await page.setViewportSize(PHONE);
  await page.goto(proofUrl(state.siteUrl));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('proof-start')).toBeInViewport({ ratio: 1 });
  expect(await scrollsSideways(page)).toBe(false);
});

test('the footer link "Known limits" opens /proof/ at #limits', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  await page.getByRole('contentinfo').locator('a[href="/proof/#limits"]').click();
  await expect(page).toHaveURL(/\/proof\/#limits$/);
  await expect(page.locator('#limits')).toBeInViewport();
  await expect(page.getByTestId('proof-limits-close')).toHaveText(
    'Start with a Drill; approve only what you mean to leave.',
  );
});

test('proves all 67,108,864 cases in the worker, lights P1 to P9, seals and certifies', async ({
  page,
  state,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one full run is enough; the phone layout is covered by the fast runs');
  test.setTimeout(FULL_RUN_MS + 120_000);
  await page.goto(harnessUrl(state.siteUrl));
  const run = page.getByTestId('proof-run');
  await expect(run).toHaveAttribute('data-status', 'idle');
  await page.getByTestId('proof-start').click();
  await expect(run).toHaveAttribute('data-status', 'running');
  await passed(page);
  const canvas = page.getByTestId('proof-canvas');
  await expect(canvas).toHaveAttribute('data-key', 'done');
  await expect(canvas).toHaveAttribute('data-painted', String(PLATE));
  await expect(run).toHaveAttribute('data-wake', 'off');
  await expect(page.getByTestId('proof-seal')).toHaveAttribute('data-match', 'equal');
  await expect(page.getByTestId('proof-netlist')).toHaveCount(3);
  await expect(page.getByTestId('proof-code')).toHaveAttribute('data-pinned', 'true');

  const text = (await page.getByTestId('proof-certificate').locator('pre').textContent()) ?? '';
  const lines = text.split('\n');
  expect(lines).toHaveLength(8);
  expect(lines[1]).toContain(KECCAK);
  expect(lines[4]).toContain('67,108,864 / 67,108,864');
  expect(lines[5]).toMatch(/^\d+\.\d s of checking on this machine\.$/);
  expect(lines[6]).toBe('Check it again in a terminal: npx -y atropyle verify --p9-seed 20261125');
  info.annotations.push({ type: 'full-run', description: lines[5] });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy certificate' }).click();
  // Windows hands back the clipboard with CRLF line ends; the certificate itself is joined with LF.
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replaceAll('\r\n', '\n')).toBe(text);
  // The finished page, certificate included, in night (the partial run below checks both themes).
  await expectAccessible(page);

  // The finished page on a phone: the seal, the code hashes, the certificate and the cast command wrap, never scroll.
  await page.setViewportSize(PHONE);
  await expect(page.getByTestId('proof-certificate')).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);

  // Run again: a fresh run starts over from an empty map; leaving the page stops its worker (useProofRun, R14).
  await page.getByTestId('proof-again').click();
  await expect(run).not.toHaveAttribute('data-status', 'done');
  await expect.poll(async () => Number(await canvas.getAttribute('data-painted'))).toBeLessThan(PLATE);
});

test('a processor that answers one P9 case differently fails the proof, and nothing is certified', async ({
  page,
  state,
}) => {
  await page.goto(harnessUrl(state.siteUrl, '#auto&blocks=4096&lie'));
  const verdict = page.getByTestId('proof-verdict');
  await expect(verdict).toHaveAttribute('data-ok', 'false', { timeout: 60_000 });
  await expect(page.getByTestId('proof-prop-P9')).toHaveAttribute('data-state', 'broken');
  await expect(page.getByTestId('proof-prop-P1')).toHaveAttribute('data-state', 'holds');
  await expect(verdict).toContainText('P9: 1 of 64 vectors differ between the simulator and step() on RPC operator #2');
  await expect(page.getByTestId('proof-seal')).toHaveAttribute('data-match', 'equal');
  await expect(page.getByTestId('proof-certificate')).toHaveCount(0);
});

test('a partial run with one operator and no P9 says so, and certifies nothing', async ({ page, state }) => {
  await page.goto(harnessUrl(state.siteUrl, '#auto&blocks=4096&nop9&rpcs=1'));
  const verdict = page.getByTestId('proof-verdict');
  await expect(verdict).toHaveAttribute('data-full', 'false', { timeout: 60_000 });
  await expect(page.getByTestId('proof-prop-P9')).toHaveAttribute('data-state', 'not-run');
  await expect(verdict).toContainText('One operator only');
  await expect(page.getByTestId('proof-certificate')).toHaveCount(0);
});

test('a finished run passes axe in both themes, and in Vietnamese at 390 px nothing scrolls sideways', async ({
  page,
  state,
}) => {
  // '#auto' runs again after each reload of the theme and language switches; 4096 blocks keep each run short.
  await page.goto(harnessUrl(state.siteUrl, '#auto&blocks=4096'));
  const verdict = page.getByTestId('proof-verdict');
  await expect(verdict).toBeVisible({ timeout: 60_000 });
  await expectAccessibleInBothThemes(page, verdict);
  await page.setViewportSize(PHONE);
  await setStoredLang(page, 'vi');
  await expect(verdict).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('proof-prop-P9')).toHaveAttribute('data-state', 'holds');
  // The longest words of the page are Vietnamese: the Run again row, the seal, the code hashes, the verdict.
  expect(await scrollsSideways(page)).toBe(false);
  await setStoredLang(page, 'en');
});

test('screens of /proof/: idle, failed on the devnet, passed', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(1_800_000);
  await page.goto(proofUrl(state.siteUrl));
  await captureScreens(page, 'proof-idle', {
    ready: (p) => expect(p.getByTestId('proof-canvas')).toHaveAttribute('data-painted', '0'),
  });
  await captureScreens(page, 'proof-error', {
    // Idempotent (R26): captureScreens reloads only when the theme or the language changes, so the 390 px shot that
    // follows the 1440 one finds the error on screen and no Run button. Press Run only on an idle page.
    ready: async (p) => {
      const run = p.getByTestId('proof-run');
      await expect(run).toHaveAttribute('data-status', /^(idle|error)$/);
      if ((await run.getAttribute('data-status')) === 'idle') await p.getByTestId('proof-start').click();
      const box = p.getByTestId('error');
      await expect(box).toBeVisible();
      await expect(box).toHaveAttribute('data-code', 'POLICY_UNAVAILABLE');
    },
  });
  await page.goto(harnessUrl(state.siteUrl, '#auto'));
  // No press: '#auto' starts the run after every reload, and a shot without a reload finds it finished.
  await captureScreens(page, 'proof-done', { ready: passed });
  // captureScreens ends with two reloads (English, then night), and '#auto' starts the run again after each one. Wait
  // for the finished map: the measurement below is about it, not about a map still painting (R26).
  await passed(page);

  // The 7C-T2 report, note 4: a theme change repaints the finished 1024² map in a layout effect. Event timing of the
  // click at 4x CPU, recorded for the report; not a gate.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    const w = window as Window & { __eventMs?: number[] };
    w.__eventMs = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__eventMs?.push(e.duration);
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  });
  const settings = await openSettings(page);
  await settings.getByText('Vellum', { exact: true }).click();
  await expect(page.getByTestId('proof-canvas')).toHaveAttribute('data-palette', 'light');
  const worst = await page.evaluate(() =>
    Math.max(0, ...((window as Window & { __eventMs?: number[] }).__eventMs ?? [])),
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  info.annotations.push({ type: 'theme-change-event-ms-4x-cpu', description: String(worst) });
  console.log(`proof: theme change on the finished map, worst event at 4x CPU: ${worst} ms`);

  // Two more states for the review: the map part way through a full run, and a processor that lies on one P9 case.
  await page.goto(harnessUrl(state.siteUrl, '#auto'));
  await captureScreens(page, 'proof-running', {
    ready: (p) =>
      expect
        .poll(async () => Number(await p.getByTestId('proof-canvas').getAttribute('data-done')), {
          timeout: FULL_RUN_MS,
        })
        .toBeGreaterThanOrEqual(FULL_BLOCKS * 0.4),
  });
  await page.goto(harnessUrl(state.siteUrl, '#auto&blocks=4096&lie'));
  await captureScreens(page, 'proof-broken', {
    ready: async (p) => {
      await expect(p.getByTestId('proof-verdict')).toHaveAttribute('data-ok', 'false', { timeout: 60_000 });
      await expect(p.getByTestId('proof-prop-P9')).toHaveAttribute('data-state', 'broken');
    },
  });
});
