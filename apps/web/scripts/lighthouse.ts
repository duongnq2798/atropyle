import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-core';
import {
  CATEGORIES,
  FORBIDDEN_REQUESTS,
  failures,
  forbiddenRequests,
  hostNote,
  LIGHTHOUSE_ROUTES,
  medianRun,
  type Run,
  runOf,
} from './lib/lighthouse-score';
import { APP_DIR, OUT_DIR } from './lib/run-next';
import { siteHeaders } from './lib/site-headers';
import { startStaticServer } from './lib/static-server';

/** Quyết định 24: three runs per route, the median decides. */
const RUNS = 3;
const REPORTS = join(APP_DIR, 'lighthouse-report');

if (!existsSync(join(OUT_DIR, 'index.html')) || existsSync(join(OUT_DIR, 'e2e'))) {
  console.error('lighthouse: out/ must hold a production build. Run `npm run build -w apps/web` first.');
  process.exit(2);
}

rmSync(REPORTS, { recursive: true, force: true });
mkdirSync(REPORTS, { recursive: true });
const server = await startStaticServer(OUT_DIR, 0, siteHeaders());
// The Chromium that Playwright installed: nothing is downloaded, and no report leaves the machine.
const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null });
/** A run Lighthouse could not measure, and says to run again: the trace lost the navigation start. */
const RETRYABLE = new Set(['NO_NAVSTART', 'NO_FCP']);
const ATTEMPTS = 3;

/**
 * One measured run in a browser context of its own. A navigation into a new renderer under load sometimes loses its
 * navigationStart, and Lighthouse then measures nothing (NO_NAVSTART). Only such a run is repeated, at most twice and
 * always with a log line; a run that produced numbers is never repeated, whatever they are.
 */
async function measure(url: string) {
  for (let attempt = 1; ; attempt++) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const result = await lighthouse(
      url,
      { output: 'html', logLevel: 'error', onlyCategories: [...CATEGORIES] },
      undefined,
      page,
    ).finally(() => context.close());
    if (!result) throw new Error(`Lighthouse returned nothing for ${url}`);
    const code = result.lhr.runtimeError?.code;
    if (code === undefined || !RETRYABLE.has(code) || attempt === ATTEMPTS) return result;
    console.warn(`  ${url}: Lighthouse could not measure the run (${code}); attempt ${attempt + 1} of ${ATTEMPTS}`);
  }
}

let failed = false;
try {
  for (const route of LIGHTHOUSE_ROUTES) {
    const name = route === '/' ? 'home' : route.replaceAll('/', '');
    const runs: Run[] = [];
    const forbidden = new Set<string>();
    for (let i = 1; i <= RUNS; i++) {
      // Every run gets a browser context of its own, so its page gets a renderer of its own: Chrome never shares a
      // renderer across contexts. Given only a port, Lighthouse opens each run's page in the default context, where
      // Chrome reused one renderer for all three runs. The next run's DevTools instrumentation then walked the previous
      // runs' heap before the page committed: on CI a 220-237 ms task in runs 2 and 3, which Lighthouse charged to
      // the page as unattributable work, x4 under simulation (TBT 808 ms).
      const result = await measure(`${server.url}${route}`);
      const report = typeof result.report === 'string' ? result.report : result.report.join('\n');
      writeFileSync(join(REPORTS, `${name}-${i}.html`), report);
      // The HTML report names a long task only as "Unattributable"; the trace says what ran. It is kept when the
      // route misses, and CI uploads the folder, so a runner's miss can be read in DevTools > Performance.
      writeFileSync(join(REPORTS, `${name}-${i}.trace.json`), JSON.stringify(result.artifacts.Trace));
      runs.push(runOf(result.lhr));
      // R18.18: a chunk that must wait for intent fails the route when any of the runs loaded it.
      for (const url of forbiddenRequests(result.lhr, FORBIDDEN_REQUESTS[route] ?? [])) forbidden.add(url);
    }
    const median = medianRun(runs);
    const missed = [...failures(median), ...[...forbidden].map((url) => `loaded a forbidden request: ${url}`)];
    // The median run carries its host's benchmarkIndex: simulated TBT scales with the host CPU (a CI runner's too).
    console.log(`${route}: ${JSON.stringify(median)}`);
    const note = hostNote(median);
    if (note) console.warn(`  ${route}: ${note}`);
    for (const m of missed) console.error(`  ${route}: ${m}`);
    if (missed.length > 0) failed = true;
    else for (let i = 1; i <= RUNS; i++) rmSync(join(REPORTS, `${name}-${i}.trace.json`), { force: true });
  }
} finally {
  await browser.disconnect();
  chrome.kill();
  await server.close();
}
console.log(failed ? 'lighthouse: FAIL (reports in apps/web/lighthouse-report/)' : 'lighthouse: PASS');
process.exit(failed ? 1 : 0);
