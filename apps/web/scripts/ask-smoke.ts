import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { APP_DIR, OUT_DIR } from './lib/run-next';
import { siteHeaders } from './lib/site-headers';
import { startStaticServer } from './lib/static-server';

/**
 * Read-only smoke of "Ask X Layer" on X Layer mainnet (spec §18.4.3 Task 5′, R18.19), for the PR. The production
 * build in out/ (DeWEB, chain 196), served with the site's headers, asks each of the three questions twice: with the
 * DeWEB default (the OKX node only), then with the cross-check on (OKX and dRPC). Only eth_blockNumber and eth_call:
 * nothing is signed or sent, and no key exists here. Prints a Markdown table and saves one screenshot per answer.
 */
const CASES = [
  ['alive', 'a'],
  ['silent', 's'],
  ['liar', 'l'],
] as const;
const SHOTS = join(APP_DIR, 'test-results', 'screens', 'home-ask-live');
const OKX = 'https://rpc.xlayer.tech';
const DRPC = 'https://xlayer.drpc.org';

if (!existsSync(join(OUT_DIR, 'index.html')) || existsSync(join(OUT_DIR, 'e2e'))) {
  console.error('ask:smoke: out/ must hold a production build. Run `npm run build -w apps/web` first.');
  process.exit(2);
}
mkdirSync(SHOTS, { recursive: true });
const server = await startStaticServer(OUT_DIR, 0, siteHeaders());
const site = new URL(server.url).origin;
// The Chromium that Playwright installed: nothing is downloaded.
const browser = await chromium.launch();
const rows = ['| cross-check | question | verdict | sentence | RPC origins |', '|---|---|---|---|---|'];
let failed = false;
try {
  for (const crossCheck of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript((on: boolean) => {
      try {
        localStorage.setItem('atropyle:crossCheck', on ? '1' : '0');
      } catch {
        // Storage blocked: the default (off) stands, and the origins column shows it.
      }
    }, crossCheck);
    const page = await context.newPage();
    const origins = new Set<string>();
    page.on('request', (r) => {
      const o = new URL(r.url()).origin;
      if (o !== site) origins.add(o);
    });
    await page.goto(`${server.url}/`);
    await page.waitForSelector('[data-testid="ask-x-layer"]:not(.invisible)');
    for (const [name, letter] of CASES) {
      origins.clear();
      await page.locator('label.ask-chip', { has: page.locator(`input[value="${letter}"]`) }).click();
      const box = page.getByTestId('ask-x-layer');
      await box.getByRole('button').click();
      await page.waitForSelector('[data-testid="ask-x-layer"]:is([data-phase="done"], [data-phase="failed"])', {
        timeout: 30_000,
      });
      const verdict = (await box.getAttribute('data-verdict')) ?? 'failed';
      const sentence = ((await box.getByRole('status').textContent()) ?? '').replace(/\s+/g, ' ').trim();
      // Both sides sorted the same way: 'https://rpc.xlayer.tech' sorts before 'https://xlayer.drpc.org'.
      const asked = [...origins].sort();
      const expected = (crossCheck ? [OKX, DRPC] : [OKX]).sort();
      if (verdict !== 'match' || asked.join() !== expected.join()) failed = true;
      rows.push(`| ${crossCheck ? 'on' : 'off'} | ${name} | ${verdict} | ${sentence} | ${asked.join(', ')} |`);
      await page
        .locator('main section')
        .first()
        .screenshot({ path: join(SHOTS, `vellum-en-1440-${name}${crossCheck ? '-cross' : ''}.png`) });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(rows.join('\n'));
console.log(failed ? 'ask:smoke: FAIL' : 'ask:smoke: PASS');
process.exitCode = failed ? 1 : 0;
