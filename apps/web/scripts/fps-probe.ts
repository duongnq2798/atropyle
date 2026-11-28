import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, chromium, type Page } from '@playwright/test';
import { OUT_DIR } from './lib/run-next';
import { siteHeaders } from './lib/site-headers';
import { startStaticServer } from './lib/static-server';

/**
 * A proxy for the motion gate of spec §11 (60 fps with the CPU slowed 4×), for the PR (7C-T12). The production build in
 * out/, served with the site's headers, in Playwright's Chromium with the CPU slowed 4× over CDP. It records the time of
 * every animation frame and every long task while a reader scrolls / (the stage loaded first, at 1440 and 390 px), drags
 * the stage's Scrubber, and while /proof/ runs. Only page loads and the read-only calls the pages make on X Layer:
 * nothing is signed or sent, and no key exists here. Prints a Markdown table. Headless frames on a shared machine stand
 * in for a phone; the gate itself stays a DevTools recording, by hand, written into the PR.
 */
const VSYNC = 1000 / 60;
/** A frame that came more than one and a half vsyncs after the one before it missed at least one vsync. */
const LATE = 1.5 * VSYNC;
/** Plan Task 12 Step 11: no drop below 60 fps beyond a few isolated frames: at most this many, never two in a row. */
const LATE_MAX = 5;
/** Plan Task 12 Step 11: no task longer than 50 ms while the reader scrolls or drags. */
const LONG_TASK_MS = 50;
const RECORD_MS = 10_000;
const TIMEOUT = 90_000;

interface Recorded {
  frames: number[];
  long: number[];
}

interface Scenario {
  name: string;
  width: number;
  path: string;
  /** Long tasks count against the verdict: the main thread must stay free while the reader scrolls or drags. */
  gated: boolean;
  run: (page: Page) => Promise<Recorded>;
}

/**
 * Plain JavaScript, passed to the page as text: tsx compiles a function with name helpers that the page does not have.
 * START records every frame and every long task into window.__fps until STOP.
 */
const START = `(() => {
  const rec = { frames: [], long: [], stop: false };
  window.__fps = rec;
  try {
    new PerformanceObserver((list) => {
      if (!rec.stop) for (const e of list.getEntries()) rec.long.push(e.duration);
    }).observe({ type: 'longtask' });
  } catch {}
  const tick = (t) => {
    if (rec.stop) return;
    rec.frames.push(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;
const STOP = `(() => {
  const rec = window.__fps;
  rec.stop = true;
  return { frames: rec.frames, long: rec.long };
})()`;

const SCENARIOS: readonly Scenario[] = [
  { name: 'scroll / with the stage loaded, 1440 px', width: 1440, path: '/', gated: true, run: scrollHome },
  { name: 'scroll / with the stage loaded, 390 px', width: 390, path: '/', gated: true, run: scrollHome },
  { name: "drag the stage's Scrubber, 1440 px", width: 1440, path: '/', gated: true, run: dragScrubber },
  { name: '/proof/ while the proof runs, 1440 px', width: 1440, path: '/proof/', gated: false, run: runProof },
];

const ms = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '-');

function verdict(s: Scenario, r: Recorded): { line: string; pass: boolean } {
  const gaps = r.frames.slice(1).map((t, i) => t - r.frames[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? Number.NaN;
  const span = r.frames.length > 1 ? r.frames[r.frames.length - 1] - r.frames[0] : 0;
  const missed = gaps.reduce((n, g) => n + Math.max(0, Math.round(g / VSYNC) - 1), 0);
  let late = 0;
  let run = 0;
  let worstRun = 0;
  for (const g of gaps) {
    const isLate = g > LATE;
    if (isLate) late += 1;
    run = isLate ? run + 1 : 0;
    worstRun = Math.max(worstRun, run);
  }
  const long = r.long.filter((d) => d > LONG_TASK_MS);
  const pass = gaps.length > 0 && late <= LATE_MAX && worstRun <= 1 && (!s.gated || long.length === 0);
  const share = span > 0 ? `${((100 * missed) / Math.max(1, Math.round(span / VSYNC))).toFixed(1)}%` : '-';
  const longest = long.length > 0 ? ` (longest ${ms(Math.max(...long))})` : '';
  const longCell = `${long.length}${longest}${s.gated ? '' : ', not gated'}`;
  const worst = ms(sorted[sorted.length - 1] ?? Number.NaN);
  const cells = [s.name, r.frames.length, ms(at(0.5)), ms(at(0.95)), worst, late, worstRun, share, longCell];
  return { line: `| ${cells.join(' | ')} | ${pass ? 'pass' : 'FAIL'} |`, pass };
}

/** The stage loads on intent (R18.18): a focus on its first story chip, once it has hydrated. */
async function loadStage(page: Page): Promise<void> {
  const chip = page.locator('[data-testid="home-stage"] input[value="inherit"]:enabled');
  await chip.waitFor({ state: 'attached' });
  await chip.focus();
  await page.locator('[data-testid="home-stage"][data-ready="true"]').waitFor({ state: 'attached' });
}

/** Wheel steps down to the end of the page and back up, for the whole recording. */
async function scrollHome(page: Page): Promise<Recorded> {
  await loadStage(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1_000);
  await page.mouse.move(24, 300);
  await page.evaluate(START);
  const until = Date.now() + RECORD_MS;
  let down = true;
  while (Date.now() < until) {
    await page.mouse.wheel(0, down ? 120 : -120);
    await page.waitForTimeout(50);
    const [y, max] = await page.evaluate(() => [
      window.scrollY,
      document.documentElement.scrollHeight - window.innerHeight,
    ]);
    if (down && y >= max - 2) down = false;
    else if (!down && y <= 2) down = true;
  }
  return page.evaluate<Recorded>(STOP);
}

/** The thumb held and swept from one end of the Scrubber to the other, for the whole recording. */
async function dragScrubber(page: Page): Promise<Recorded> {
  await loadStage(page);
  const track = page.getByTestId('home-stage-scrubber');
  const thumb = page.getByTestId('home-stage-scrubber-thumb-0');
  await thumb.waitFor();
  await track.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_000);
  const box = await track.boundingBox();
  const t = await thumb.boundingBox();
  if (!box || !t) throw new Error('the Scrubber is not on screen');
  const y = t.y + t.height / 2;
  await page.mouse.move(t.x + t.width / 2, y);
  await page.mouse.down();
  await page.evaluate(START);
  const until = Date.now() + RECORD_MS;
  let right = true;
  while (Date.now() < until) {
    await page.mouse.move(right ? box.x + box.width - 8 : box.x + 8, y, { steps: 30 });
    right = !right;
  }
  const r = await page.evaluate<Recorded>(STOP);
  await page.mouse.up();
  return r;
}

/** A press on Run, then the first ten seconds of the run: the worker computes, the main thread paints the map. */
async function runProof(page: Page): Promise<Recorded> {
  const start = page.locator('[data-testid="proof-start"]:enabled');
  await start.waitFor();
  await page.waitForTimeout(1_000);
  await page.evaluate(START);
  await start.click();
  await page.waitForTimeout(RECORD_MS);
  return page.evaluate<Recorded>(STOP);
}

async function measure(browser: Browser, url: string, s: Scenario): Promise<Recorded> {
  const context = await browser.newContext({ viewport: { width: s.width, height: s.width < 768 ? 844 : 900 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    page.setDefaultNavigationTimeout(TIMEOUT);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(`${url}${s.path}`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    return await s.run(page);
  } finally {
    await context.close();
  }
}

if (!existsSync(join(OUT_DIR, 'index.html')) || existsSync(join(OUT_DIR, 'e2e'))) {
  console.error('fps-probe: out/ must hold a production build. Run `npm run build -w apps/web` first.');
  process.exit(2);
}
const server = await startStaticServer(OUT_DIR, 0, siteHeaders());
// The Chromium that Playwright installed: nothing is downloaded.
const browser = await chromium.launch();
const rows = [
  '| scenario (CPU 4x slower) | frames | p50 ms | p95 ms | worst ms | late frames (> 25 ms) | longest late run | missed vsyncs | long tasks > 50 ms | verdict |',
  '|---|---|---|---|---|---|---|---|---|---|',
];
let failed = false;
try {
  for (const s of SCENARIOS) {
    try {
      const r = verdict(s, await measure(browser, server.url, s));
      rows.push(r.line);
      if (!r.pass) failed = true;
    } catch (e) {
      failed = true;
      const why = e instanceof Error ? (e.message.split('\n')[0] ?? e.message) : String(e);
      rows.push(`| ${s.name} | error: ${why} | | | | | | | | FAIL |`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(rows.join('\n'));
console.log(
  `budget: at most ${LATE_MAX} late frames per ${RECORD_MS / 1000} s run and never two in a row; no long task over ${LONG_TASK_MS} ms while scrolling or dragging`,
);
console.log(failed ? 'fps:probe: FAIL' : 'fps:probe: PASS');
process.exitCode = failed ? 1 : 0;
