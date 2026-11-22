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
  const smoke = page.getByTestId('worker-smoke');
  await page.waitForSelector('[data-testid="worker-smoke"]:not([data-state="running"])', { timeout: 90_000 });
  const state = await smoke.getAttribute('data-state');
  console.log(`worker smoke: ${state} — ${await smoke.textContent()}`);
  for (const e of errors) console.error(`console: ${e}`);
  ok = state === 'ok' && !errors.some((e) => /Content Security Policy/i.test(e));
} finally {
  await browser.close();
  await server.close();
}
console.log(ok ? 'worker-check: PASS' : 'worker-check: FAIL');
process.exit(ok ? 0 : 1);
