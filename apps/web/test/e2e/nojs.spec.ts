import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec §18 principle 6: the first paint is the final layout, so a reader without JavaScript loses nothing to read.
test.use({ javaScriptEnabled: false });

const XLAYER = JSON.parse(readFileSync(new URL('../../../../deployments/xlayer.json', import.meta.url), 'utf8')) as {
  circuits: { netlistKeccak: { policy: string } };
};
/** The policy netlist keccak; the proof line names it in short form, 0x7016…3864 (Task 9, src/config/facts.ts). */
const KECCAK = XLAYER.circuits.netlistKeccak.policy;

/**
 * Seen by a reader: visible to Playwright, and no ancestor left at opacity 0. toBeVisible counts opacity 0 as visible,
 * and an `m.*` element prerenders its initial style, which only JavaScript would lift.
 */
async function expectSeen(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const chain = target.locator('xpath=ancestor-or-self::*');
  const n = await chain.count();
  for (let i = 0; i < n; i++) await expect(chain.nth(i)).not.toHaveCSS('opacity', '0');
}

/**
 * What every page shows before any script runs: the proof line, then the footer and its promise (Task 9). The proof
 * line is found by its test id, never by position: it is the first visible band, right after the skip link.
 */
async function expectFrame(page: Page): Promise<void> {
  const line = page.getByTestId('proof-line');
  // Both variants are in the HTML and CSS shows one; each links the short keccak to the proof.
  const keccak = line
    .locator('a[href="/proof/"]')
    .filter({ hasText: KECCAK.slice(0, 6) })
    .filter({ hasText: KECCAK.slice(-4) })
    .filter({ visible: true })
    .first();
  await expectSeen(keccak);
  await expectSeen(line.getByText('unaudited').filter({ visible: true }).first());
  const footer = page.getByRole('contentinfo');
  await expectSeen(footer.getByText('No trackers'));
  await expectSeen(footer.locator('a[href="/proof/#limits"]'));
  await expectSeen(footer.locator('a[href="/verify/"]'));
}

/**
 * `/`: the question, the two ways in (rehearse it, see the proof), the three facts with the door for heirs, and the
 * stage.
 */
async function expectHome(page: Page): Promise<void> {
  await expectSeen(page.getByRole('heading', { level: 1 }));
  const main = page.getByRole('main');
  await expectSeen(main.locator('a[href="/create/#drill"]').first());
  await expectSeen(main.locator('a[href="/proof/"]').first());
  const facts = main.getByTestId('hero-facts');
  await expectSeen(facts.getByText('Your tokens stay in your wallet'));
  // The e2e build is DeWEB: without JavaScript the live fact stays text (ExternalLink, Quyết định 16). A regex reads
  // the raw text, and home.messages.ts glues "X Layer" and "since {date}" with no-break spaces: \s matches them.
  await expectSeen(facts.getByText(/^Live on X\sLayer mainnet since\s\d{1,2} [A-Z][a-z]{2} \d{4}$/));
  await expectSeen(facts.locator('a[href="/verify/"]'));
  // Ask the circuit without JavaScript (spec §18.4.3 Task 5′): native radios, and :has() lights and answers.
  await expectSeen(main.locator('.ask-answer [data-for="a"]'));
  await expect(main.locator('.ask-answer [data-for="s"]')).toBeHidden();
  const silentOnly = main.locator('.weave-col path[data-v~="s"]:not([data-v~="a"])').first();
  const unlit = await silentOnly.evaluate((p) => getComputedStyle(p).stroke);
  await main.locator('label.ask-chip', { has: page.locator('input[value="s"]') }).click();
  await expectSeen(main.locator('.ask-answer [data-for="s"]'));
  await expect(main.locator('.ask-answer [data-for="a"]')).toBeHidden();
  await expect.poll(() => silentOnly.evaluate((p) => getComputedStyle(p).stroke)).not.toBe(unlit);
  // The stage without JavaScript (7C T6): the default story, prerendered and dated, with its controls inert.
  const stage = main.getByTestId('home-stage');
  await expectSeen(stage.getByRole('heading', { level: 2, name: 'Every day, decided by the circuit' }));
  await expect(stage).toHaveAttribute('data-engine', 'prerender');
  await expectSeen(stage.getByTestId('home-stage-caption').getByText('Day 0 · Your first check-in'));
  for (const row of ['Day 180 · Silence. The alarm', 'Day 194 · Through the gate']) {
    await expectSeen(stage.getByTestId('home-stage-beats').getByText(row));
  }
  await expect(stage.locator('input[value="recover"]')).toBeDisabled();
  await expect(stage.getByTestId('home-stage-beat-0')).toBeDisabled();
}

/** `/proof/`: the question, the empty map and its key, the seal's source row, the command, and every limit. */
async function expectProof(page: Page): Promise<void> {
  await expectSeen(page.getByRole('heading', { level: 1 }));
  const main = page.getByRole('main');
  await expectSeen(main.getByRole('img').first());
  await expectSeen(main.getByTestId('proof-seal').locator('[data-group="0"] [data-row="source"]'));
  await expect(main.getByTestId('proof-seal').locator('[data-group="0"] [data-row="source"]')).toHaveText(
    KECCAK.slice(2, 6),
  );
  await expectSeen(main.getByTestId('proof-cli').getByText('npx -y atropyle verify'));
  await expectSeen(main.getByText('The proof runs in your browser and needs JavaScript.', { exact: false }));
  const limits = main.locator('#limits');
  await expectSeen(limits.getByRole('heading', { level: 2 }));
  await expect(limits.getByTestId('proof-limit')).toHaveCount(6);
  for (let i = 0; i < 6; i++) await expectSeen(limits.getByTestId('proof-limit').nth(i));
  await expectSeen(main.getByTestId('proof-limits-close'));
}

/** `/me/` (7C T8): the title, what connecting shares, and the command that reads the same list with no wallet. */
async function expectMe(page: Page): Promise<void> {
  await expectSeen(page.getByRole('heading', { level: 1, name: 'My vaults' }));
  await expectSeen(page.getByRole('heading', { level: 2, name: 'Connect a wallet to see its vaults' }));
  await expectSeen(page.getByTestId('me-cli').getByText('npx -y atropyle vaults <address>'));
}

/** Every page that must read without JavaScript. Plan 7B Task 12 adds 'verify/'. */
const PAGES: readonly { path: string; content(page: Page): Promise<void> }[] = [
  { path: '', content: expectHome },
  { path: 'proof/', content: expectProof },
  { path: 'me/', content: expectMe },
];
if (PAGES.length === 0) throw new Error('nojs.spec.ts checks no page');

for (const { path, content } of PAGES) {
  test(`/${path} reads without JavaScript`, async ({ page, state }) => {
    await page.goto(new URL(path, state.siteUrl).href);
    // Proof that no page script ran: Next's inline bootstrap defines self.__next_f as soon as scripts run. Without
    // it, a lost `javaScriptEnabled: false` would let every check below pass on a hydrated page.
    expect(await page.evaluate(() => '__next_f' in self)).toBe(false);
    await content(page);
    await expectFrame(page);
  });
}
