import { ANVIL, expect, test } from './fixtures.ts';
import { connectWallet, expectAccessible, openSettings, settle } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';
import { rpcCall } from './state.ts';

/** compactAddress of ANVIL[1] (Task 5). */
const ACCOUNT = 'Wallet 0x7099 7970 … 17dc 79C8';

const REFUSED = [
  ['eth_sendRawTransaction', ['0x02f8']],
  ['personal_sign', ['0x68656c6c6f', ANVIL[1]]],
  ['eth_sign', [ANVIL[1], '0x68656c6c6f']],
  ['eth_signTypedData_v4', [ANVIL[1], '{}']],
  ['eth_signTransaction', [{ from: ANVIL[1], to: ANVIL[2] }]],
] as const;

test('a wallet connects through the sheet, comes back after a reload without a prompt, and disconnects', async ({
  page,
  state,
  wallet,
}) => {
  const w = await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose a wallet' });
  await expect(sheet.getByRole('button', { name: 'Test Wallet' })).toBeVisible();
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Test Wallet' }).click();
  await expect(sheet).toBeHidden();
  const account = page.getByRole('button', { name: ACCOUNT, exact: true });
  await expect(account).toBeVisible();
  expect(w.calls.map((c) => c.method)).toContain('eth_requestAccounts');

  const before = w.calls.length;
  await page.reload();
  await expect(account).toBeVisible();
  // Quyết định 27: a remembered wallet comes back through eth_accounts, never through a prompt.
  expect(w.calls.slice(before).map((c) => c.method)).not.toContain('eth_requestAccounts');

  await account.click();
  // Spec §18.4.2 Task 1: the checksum capitals at 650 move nothing, in Chromium with the self-hosted face. The groups
  // span shrinks to the menu and wraps, so its own width stays the same whatever the advances are: each drawn group,
  // a run of 2 or 4 characters that never breaks, is measured instead. The menu scales in (atro-pop-in), and
  // getBoundingClientRect includes the transform, so the measuring starts once the animations have settled.
  const groups = page.getByRole('dialog', { name: 'Wallet', exact: true }).locator('[data-part="groups"]');
  await expect(groups).toBeVisible();
  await settle(page);
  const drawn = await groups.evaluate(async (g) => {
    const faces = await document.fonts.load('650 1em "Atropyle Mono"', '0x');
    const upper = [...g.querySelectorAll<HTMLElement>('[data-case="upper"]')];
    const measure = () => ({
      widths: [...g.querySelectorAll(':scope > span')].map((s) => s.getBoundingClientRect().width),
      height: g.getBoundingClientRect().height,
    });
    const at650 = measure();
    // The hanging indent: every group that starts a line starts where the first group does (x of group 1).
    const boxes = [...g.querySelectorAll(':scope > span')].map((s) => s.getBoundingClientRect());
    const lineStarts = boxes
      .map((b, i) => ({ b, i }))
      .filter(({ b, i }) => i > 1 && b.top > (boxes[i - 1]?.top ?? 0) + 1)
      .map(({ b }) => b.left - (boxes[1]?.left ?? 0));
    const weight = upper[0] ? getComputedStyle(upper[0]).fontWeight : '';
    for (const el of upper) el.style.fontWeight = '400';
    await document.fonts.ready;
    const at400 = measure();
    // Back to the markup as drawn, for the audit below.
    for (const el of upper) el.style.fontWeight = '';
    return {
      faces: faces.length,
      family: getComputedStyle(g).fontFamily,
      upper: upper.length,
      weight,
      at650,
      at400,
      lineStarts,
    };
  });
  expect(drawn.faces).toBeGreaterThan(0);
  expect(drawn.family).toMatch(/^"?Atropyle Mono"?,/);
  expect(drawn.upper).toBeGreaterThan(0);
  expect(drawn.weight).toBe('650');
  expect(drawn.at650.widths).toHaveLength(11);
  expect(drawn.at400).toEqual(drawn.at650);
  // The address wraps in the menu (46ch of text in a 25ch block), and each wrapped line starts in the column of the
  // first group, not 0.45ch off it.
  expect(drawn.lineStarts.length).toBeGreaterThan(0);
  for (const dx of drawn.lineStarts) expect(Math.abs(dx)).toBeLessThan(0.5);
  // The address stands as one Ledger block of two rows: "0x" and five groups, then five groups (the 25ch cap in
  // address.tsx), and the copy button ends the row. On X Layer the row also carries the OKLink button, 40 px with its
  // gap (size-8 and gap-2 in ExternalLink), which this anvil build cannot show: the explorer URL of a local deployment
  // is null. Less those 40 px, the room the groups have before the copy button must still hold the first row, or the
  // address on the real site breaks into three ragged lines.
  const row = await groups.evaluate((g) => {
    const boxes = [...g.querySelectorAll(':scope > span')].map((s) => s.getBoundingClientRect());
    const lines = new Map<number, number>();
    for (const b of boxes) lines.set(Math.round(b.top), (lines.get(Math.round(b.top)) ?? 0) + 1);
    const address = g.closest('[data-address]');
    const copy = address?.querySelector('button')?.getBoundingClientRect();
    const gap = address ? Number.parseFloat(getComputedStyle(address).columnGap) : 0;
    const box = g.getBoundingClientRect();
    return {
      perLine: [...lines.values()],
      firstRow: (boxes[5]?.right ?? Number.POSITIVE_INFINITY) - (boxes[0]?.left ?? 0),
      room: (copy?.left ?? 0) - gap - box.left,
      end: (address?.getBoundingClientRect().right ?? 0) - (copy?.right ?? 0),
    };
  });
  expect(row.perLine).toEqual([6, 5]);
  expect(Math.abs(row.end)).toBeLessThan(1);
  expect(row.room - 40).toBeGreaterThanOrEqual(row.firstRow);
  // Below sm the menu spans the screen less the collision padding on both sides, so it stands centred under the
  // header; from sm up it hangs from the account button, end-aligned.
  const menu = await page.getByRole('dialog', { name: 'Wallet', exact: true }).evaluate((m) => {
    const b = m.getBoundingClientRect();
    return { left: b.left, right: document.documentElement.clientWidth - b.right, width: b.width };
  });
  const anchor = await account.evaluate((a) => document.documentElement.clientWidth - a.getBoundingClientRect().right);
  if ((page.viewportSize()?.width ?? 0) < 640) {
    expect(Math.abs(menu.left - menu.right)).toBeLessThan(1);
    expect(menu.left).toBeCloseTo(12, 0);
  } else {
    expect(Math.abs(menu.right - anchor)).toBeLessThan(1);
    expect(menu.width).toBeCloseTo(352, 0);
  }
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Disconnect' }).click();
  const connect = page.getByRole('button', { name: 'Connect wallet' });
  await expect(connect).toBeVisible();
  await page.reload();
  await expect(connect).toBeVisible();
  await expect(account).toBeHidden();
});

/**
 * Parked T11: one press on Connect right after Escape closed the settings did not open the sheet. The press is a
 * person's (mouse.click or touchscreen.tap at the button), not locator.click, which waits until the closing settings
 * are out of the way.
 */
test('one press on Connect right after Escape closed the settings opens the wallet sheet', async ({
  page,
  state,
  wallet,
}, info) => {
  await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  const connect = page.getByRole('button', { name: 'Connect wallet' });
  await expect(connect).toBeVisible();
  const box = await connect.boundingBox();
  if (box === null) throw new Error('Connect wallet has no box');
  const settings = await openSettings(page);
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  if (info.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  const sheet = page.getByRole('dialog', { name: 'Choose a wallet' });
  await expect(sheet.getByRole('button', { name: 'Test Wallet' })).toBeVisible();
  // The settings finish closing behind the sheet; giving focus back to their button must not close it or take focus.
  await expect(settings).toBeHidden();
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
});

test('a wallet on another chain sees the banner and switches with one press', async ({ page, state, wallet }) => {
  await wallet({ account: ANVIL[1], chainId: 196, knownChains: [31337] });
  await page.goto(state.siteUrl);
  await connectWallet(page);
  const banner = page.getByTestId('network-banner');
  await expect(banner).toContainText('Your wallet is on X Layer. Atropyle runs on Anvil (chain 31337).');
  await expect(page.getByRole('button', { name: `${ACCOUNT}, wrong network` })).toBeVisible();
  await expectAccessible(page);
  await banner.getByRole('button', { name: 'Switch to Anvil' }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByRole('button', { name: ACCOUNT, exact: true })).toBeVisible();
});

test('the wallet refuses signing and raw-transaction methods before anvil sees them', async ({
  page,
  state,
  wallet,
}) => {
  const w = await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  const before = await rpcCall(state.rpcUrl, 'eth_blockNumber');
  const codes = await page.evaluate(async (cases) => {
    const provider = await new Promise<{ request(a: { method: string; params: unknown[] }): Promise<unknown> }>(
      (resolve) => {
        window.addEventListener('eip6963:announceProvider', (e) => resolve((e as CustomEvent).detail.provider), {
          once: true,
        });
        window.dispatchEvent(new Event('eip6963:requestProvider'));
      },
    );
    const out: unknown[] = [];
    for (const [method, params] of cases) {
      out.push(
        await provider.request({ method, params: [...params] }).then(
          () => 'accepted',
          (e: { code?: number }) => e.code,
        ),
      );
    }
    return out;
  }, REFUSED);
  expect(codes).toEqual(REFUSED.map(() => 4200));
  expect(w.calls.map((c) => c.method)).toEqual(REFUSED.map(([m]) => m));
  expect(await rpcCall(state.rpcUrl, 'eth_blockNumber')).toBe(before);
});

/**
 * Spec §18.4.2 Task 1: the wallet menu is the screen of 7A that shows an address in full, so it carries the review
 * shots of the Ledger voice. Each reload (theme, language) closes the menu; `ready` opens it again. After a reload
 * the remembered wallet comes back through eth_accounts, so the account button returns without a prompt.
 */
test('screens of the wallet menu: the full address in the Ledger voice', async ({ page, state, wallet }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(300_000);
  await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  await connectWallet(page);
  const account = page.getByRole('button', { name: /^(Wallet|Ví) 0x7099 7970 … 17dc 79C8$/ });
  const menu = page.getByRole('dialog').filter({ has: page.locator(`[data-address="${ANVIL[1]}"]`) });
  await captureScreens(page, 'wallet-menu', {
    ready: async () => {
      if (!(await menu.isVisible())) await account.click();
      await expect(menu).toBeVisible();
    },
  });
});
