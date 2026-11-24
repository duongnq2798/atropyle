import { chromium } from '@playwright/test';
import { buildApp, OUT_DIR } from './lib/run-next';
import { startStaticServer } from './lib/static-server';

// The strictest policy the site will run under for workers and connections. Inline scripts stay allowed here
// because a header cannot carry the per-page hashes; the meta CSP of Task 15 adds those on top.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

/** The smoke worker of Task 2, then the production verify worker of Task 12. */
const ROWS = ['worker-smoke', 'worker-verify'] as const;

const built = await buildApp({ env: { ...process.env, ATROPYLE_E2E: '1', NEXT_PUBLIC_TARGET: 'deweb' } });
if (built.code !== 0) process.exit(built.code);

const server = await startStaticServer(OUT_DIR, 0, { 'content-security-policy': CSP });
const browser = await chromium.launch();
let ok = false;
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/e2e/worker/`);
  const states: string[] = [];
  for (const id of ROWS) {
    await page.waitForSelector(`[data-testid="${id}"]:not([data-state="running"])`, { timeout: 90_000 });
    const row = page.getByTestId(id);
    const state = (await row.getAttribute('data-state')) ?? 'missing';
    states.push(state);
    console.log(`${id}: ${state} — ${await row.textContent()}`);
  }
  for (const e of errors) console.error(`console: ${e}`);
  ok = states.every((s) => s === 'ok') && !errors.some((e) => /Content Security Policy/i.test(e));
} finally {
  await browser.close();
  await server.close();
}
console.log(ok ? 'worker-check: PASS' : 'worker-check: FAIL');
process.exit(ok ? 0 : 1);
