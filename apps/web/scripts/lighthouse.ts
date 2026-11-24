import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
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
let failed = false;
try {
  for (const route of LIGHTHOUSE_ROUTES) {
    const runs: Run[] = [];
    const forbidden = new Set<string>();
    for (let i = 1; i <= RUNS; i++) {
      const result = await lighthouse(`${server.url}${route}`, {
        port: chrome.port,
        output: 'html',
        logLevel: 'error',
        onlyCategories: [...CATEGORIES],
      });
      if (!result) throw new Error(`Lighthouse returned nothing for ${route}`);
      const name = route === '/' ? 'home' : route.replaceAll('/', '');
      const report = typeof result.report === 'string' ? result.report : result.report.join('\n');
      writeFileSync(join(REPORTS, `${name}-${i}.html`), report);
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
  }
} finally {
  chrome.kill();
  await server.close();
}
console.log(failed ? 'lighthouse: FAIL (reports in apps/web/lighthouse-report/)' : 'lighthouse: PASS');
process.exit(failed ? 1 : 0);
