import { type AtropyleClient, encodePayload, type SignPayload, toPayload } from '@atropyle/sdk';
import type { Page } from '@playwright/test';
import { encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { ANVIL, expect, test } from './fixtures.ts';
import { connectFrom, disconnect, flipCase } from './flows.ts';
import { expectAccessible, expectAccessibleInBothThemes } from './helpers.ts';
import { OKX_ORIGINS } from './network.ts';
import { captureScreens, shouldCapture } from './screens.ts';
import { warp } from './state.ts';

const OWNER = ANVIL[1];
const methods = (w: { calls: { method: string }[] }) => w.calls.map((c) => c.method);
/** The sign page of this build for a payload: /sign/#p=…, the form the boot script moves the legacy link to. */
const signUrl = (siteUrl: string, p: SignPayload) => `${new URL('sign/', siteUrl).href}#p=${encodePayload(p)}`;
const cardConnect = (page: Page) => page.getByTestId('sign-tx-connect');

/** A transfer and an approval to a stranger: two calls no Atropyle link ever makes. */
function outsideWhitelist(atro: AtropyleClient): SignPayload {
  const token = atro.deployment.feeTokens[0];
  return {
    chainId: atro.deployment.chainId,
    from: OWNER,
    steps: [
      {
        to: token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [ANVIL[8], 1n] }),
        value: 0n,
      },
      {
        to: token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [ANVIL[8], 1n] }),
        value: 0n,
      },
    ],
  };
}

/** A Simple Drill for one heir that lists the first fee token, as /create/ would prepare it. */
function drillPlan(atro: AtropyleClient, heir: (typeof ANVIL)[number]) {
  return atro.prepare.createVault(
    atro.plan.template('simple', {
      heirs: [{ account: heir }],
      drill: true,
      assets: [{ kind: 'erc20', token: atro.deployment.feeTokens[0] }],
    }),
    { owner: OWNER, drill: true },
  );
}

test('a valid link is checked again and signed through wallet_sendCalls', async ({ page, atro, state, wallet }) => {
  const vault = state.seeded.simple;
  await warp(state, 30);
  const before = (await atro.vault(vault).status()).lastAlive;
  const plan = await atro.vault(vault).prepare({ type: 'checkIn' }, { as: OWNER });
  const w = await wallet({ account: OWNER, sendCalls: true });
  // The SDK still writes the legacy #/sign?p= form; the boot script moves it to /sign/#p=.
  await page.goto(atro.handoff.link(plan, state.siteUrl));
  await expect(page).toHaveURL(/\/sign\/#p=/);
  await connectFrom(page, cardConnect(page));
  for (const id of ['decoded', 'whitelist', 'simulation', 'signer'])
    await expect(page.getByTestId(`sign-check-${id}`)).toHaveAttribute('data-state', 'pass');
  await expect(page.getByTestId('sign-tx-mirror-bundle')).toBeVisible();
  // Each theme reloads the page; the wallet comes back through eth_accounts.
  await expectAccessibleInBothThemes(page, page.getByTestId('sign-tx-send'));
  await expect(page.getByTestId('sign-tx-send')).toBeEnabled();
  expect(methods(w)).not.toContain('wallet_sendCalls');
  await page.getByTestId('sign-tx-send').click();
  await expect(page.getByTestId('sign-tx-done')).toBeVisible();
  expect(methods(w)).toContain('wallet_sendCalls');
  expect(methods(w)).not.toContain('eth_sendTransaction');
  expect((await atro.vault(vault).status()).lastAlive).toBeGreaterThan(before);
  await expect(page.getByTestId('sign-open-vault')).toBeVisible();
});

test('a guardian signs a vote only after typing the exact wallet it votes for', async ({
  page,
  atro,
  state,
  wallet,
}) => {
  const vault = state.seeded.guarded;
  const guardian = ANVIL[3];
  const target = ANVIL[6];
  const plan = await atro.vault(vault).prepare({ type: 'voteRecovery', target }, { as: guardian });
  const w = await wallet({ account: guardian });
  await page.goto(signUrl(state.siteUrl, toPayload(plan)));
  await connectFrom(page, cardConnect(page));
  await expect(page.getByTestId('sign-guardian')).toBeVisible();
  await expect(page.getByTestId('warning-GUARDIAN_VERIFY_OUT_OF_BAND')).toHaveCount(0);
  await expect(page.getByTestId('sign-tx-irreversible-0')).toBeVisible();
  const field = page.getByTestId('sign-vote-target-0');
  await expect(field).toHaveValue('');
  await expect(page.getByTestId('sign-tx-send')).toBeDisabled();

  await field.fill(ANVIL[7]);
  await expect(page.getByTestId('sign-vote-target-0-error')).toHaveAttribute('data-reason', 'mismatch');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill(flipCase(target));
  await expect(page.getByTestId('sign-vote-target-0-error')).toHaveAttribute('data-reason', 'invalid');
  await expect(page.getByTestId('sign-tx-send')).toBeDisabled();
  await field.fill(target.toLowerCase());
  await expect(page.getByTestId('sign-vote-target-0-error')).toHaveCount(0);
  await expect(page.getByTestId('sign-tx-send')).toBeEnabled();
  expect(methods(w)).not.toContain('eth_sendTransaction');
  await page.getByTestId('sign-tx-send').click();
  await expect(page.getByTestId('sign-tx-done')).toBeVisible();
  expect((await atro.vault(vault).status()).recVotes).toContainEqual({ guardian, target });
});

test('a Drill link that approves a token signs only after the owner types every heir again', async ({
  page,
  atro,
  state,
  wallet,
}) => {
  const heir = ANVIL[2];
  const plan = await drillPlan(atro, heir);
  if (!plan.vault) throw new Error('no predicted vault');
  const vault = plan.vault;
  const w = await wallet({ account: OWNER, sendCalls: true });
  await page.goto(signUrl(state.siteUrl, toPayload(plan)));
  await connectFrom(page, cardConnect(page));

  const create = plan.steps.findIndex((s) => s.action === 'createVault');
  const terms = page.getByTestId(`sign-terms-${create}`);
  await expect(terms.locator(`[data-address="${vault}" i]`).first()).toBeVisible();
  // A Simple Drill pays its heir 4 minutes after creation, with nobody signing.
  await expect(page.getByTestId(`sign-terms-${create}-earliest`)).toHaveAttribute('data-after', '240');
  const heirs = page.getByTestId(`sign-terms-${create}-heirs`);
  await expect(heirs.locator('li').filter({ has: page.locator(`[data-address="${heir}" i]`) })).toContainText('100%');
  await expect(page.getByTestId(`sign-terms-${create}-guardians`)).toHaveText('No guardians.');
  // Every call of the bundle is one the mirror can read: the token's kind comes from the plan's asset list.
  await expect(page.getByTestId('sign-tx-mirror-bundle')).toBeVisible();
  await expect(page.locator('[data-testid^="sign-tx-mirror-"][data-testid$="-danger-unknownCall"]')).toHaveCount(0);

  await expect(page.getByTestId('sign-confirm')).toBeVisible();
  // The gate at rest in both themes; the reload keeps the link in the hash and the wallet reconnects by itself.
  await expectAccessibleInBothThemes(page, page.getByTestId('sign-confirm-0'));
  await expect(page.getByTestId('sign-confirm-0')).toHaveValue('');
  await expect(page.getByTestId('sign-confirm-1')).toHaveCount(0);
  await expect(page.getByTestId('sign-tx-send')).toBeDisabled();
  await page.getByLabel(/^Heir 1 \(100%\)/).fill(ANVIL[7]);
  await expect(page.getByTestId('sign-confirm-0-error')).toHaveAttribute('data-reason', 'mismatch');
  await expect(page.getByTestId('sign-confirm-0')).toHaveAttribute('aria-invalid', 'true');
  // The error state too: its message, its live region and the field's described-by.
  await expectAccessible(page);
  await expect(page.getByTestId('sign-tx-send')).toBeDisabled();
  await page.getByLabel(/^Heir 1 \(100%\)/).fill(heir.toLowerCase());
  await expect(page.getByTestId('sign-confirm-count')).toHaveText('1 of 1 addresses match.');
  await expect(page.getByTestId('sign-tx-send')).toBeEnabled();
  expect(methods(w)).not.toContain('wallet_sendCalls');
  expect(methods(w)).not.toContain('eth_sendTransaction');

  await page.getByTestId('sign-tx-send').click();
  await expect(page.getByTestId('sign-tx-done')).toBeVisible();
  expect(await atro.vault(vault).config()).toMatchObject({ owner: OWNER, drill: true, heirs: [{ account: heir }] });
});

test('a tampered link is refused before the wallet hears of it', async ({ page, atro, state, wallet }) => {
  const vault = state.seeded.simple;
  const usdc = atro.deployment.feeTokens[1];
  const plan = await atro
    .vault(vault)
    .prepare({ type: 'setAssets', assets: [{ kind: 'erc20', token: usdc }] }, { as: OWNER });
  const p = toPayload(plan);
  const approve = p.steps.findIndex((s) => s.data.startsWith('0x095ea7b3'));
  expect(approve).toBeGreaterThanOrEqual(0);
  const attacker = ANVIL[8].slice(2).toLowerCase();
  const tampered: SignPayload = {
    ...p,
    steps: p.steps.map((s, i) =>
      i === approve ? { ...s, data: s.data.replace(vault.slice(2).toLowerCase(), attacker) as Hex } : s,
    ),
  };
  expect(tampered.steps[approve].data).not.toBe(p.steps[approve].data);
  const w = await wallet({ account: OWNER, sendCalls: true });
  await page.goto(signUrl(state.siteUrl, tampered));
  await expect(page.getByTestId('sign-refused')).toBeVisible();
  await expect(page.getByTestId(`sign-step-${approve}`)).toHaveAttribute('data-allowed', 'false');
  await expect(page.getByTestId('sign-check-whitelist')).toHaveAttribute('data-state', 'fail');
  await expect(page.getByTestId('sign-tx')).toHaveCount(0);
  await expectAccessibleInBothThemes(page, page.getByTestId('sign-refused'));
  expect(methods(w)).not.toContain('wallet_sendCalls');
  expect(methods(w)).not.toContain('eth_sendTransaction');
});

test('calls to contracts outside the whitelist are refused', async ({ page, atro, state, wallet }) => {
  await wallet({ account: OWNER });
  await page.goto(signUrl(state.siteUrl, outsideWhitelist(atro)));
  await expect(page.getByTestId('sign-refused')).toBeVisible();
  await expect(page.getByTestId('sign-step-0')).toHaveAttribute('data-allowed', 'false');
  await expect(page.getByTestId('sign-step-1')).toHaveAttribute('data-allowed', 'false');
  await expect(page.getByTestId('sign-tx')).toHaveCount(0);
});

test('a corrupt link, or none at all, shows LINK_INVALID', async ({ page, state }) => {
  for (const hash of ['#p=AAAAAAAAAAAA', '']) {
    await page.goto(`${new URL('sign/', state.siteUrl).href}${hash}`);
    await expect(page.getByTestId('sign-invalid')).toBeVisible();
    await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'LINK_INVALID');
  }
});

test('wrong account, then the right one on the wrong network', async ({ page, atro, state, wallet }) => {
  const vault = state.seeded.simple;
  const plan = await atro.vault(vault).prepare({ type: 'checkIn' }, { as: OWNER });
  const w = await wallet({ account: ANVIL[4], chainId: 1 });
  await page.goto(signUrl(state.siteUrl, toPayload(plan)));
  await connectFrom(page, cardConnect(page));
  await expect(page.getByTestId('sign-tx-wrong-account')).toBeVisible();
  await expect(page.getByTestId('sign-check-signer')).toHaveAttribute('data-state', 'fail');
  await expect(page.getByTestId('sign-tx-send')).toHaveCount(0);
  await expect(page.getByTestId('network-banner')).toBeVisible();

  w.setAccount(OWNER);
  await disconnect(page);
  await connectFrom(page, cardConnect(page));
  await expect(page.getByTestId('sign-check-signer')).toHaveAttribute('data-state', 'pass');
  await page.getByTestId('sign-tx-send').click();
  await expect(page.getByTestId('sign-tx-done')).toBeVisible();
  // The fake wallet knows only chain 1: the switch fails with 4902, the app adds anvil (0x7a69), then switches.
  expect(methods(w)).toContain('wallet_switchEthereumChain');
  expect(w.calls.find((c) => c.method === 'wallet_addEthereumChain')?.params[0]).toMatchObject({ chainId: '0x7a69' });
  expect(methods(w)).toContain('eth_sendTransaction');
});

/**
 * Ready for a full-page shot: the header's wallet button has come back (the shell is settled) and the page is at its
 * top, so the sticky header is drawn where it belongs and not over the card a field scrolled into view.
 */
async function atTop(page: Page, o: { wallet?: boolean } = {}): Promise<void> {
  // "Wallet 0x…" in English, "Ví 0x…" in Vietnamese.
  if (o.wallet !== false) await expect(page.getByRole('button', { name: /^(Wallet|Ví) 0x/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('screens of the sign page: every state, from checking to signed', async ({ page, atro, state, wallet }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(420_000);

  // Checking: inspect has not answered yet. Every chain request waits until the three shots are taken.
  const checkIn = await atro.vault(state.seeded.simple).prepare({ type: 'checkIn' }, { as: OWNER });
  const w = await wallet({ account: OWNER, sendCalls: true });
  const gate: { open?: () => void } = {};
  const held = new Promise<void>((resolve) => {
    gate.open = resolve;
  });
  const hold = (url: URL) => OKX_ORIGINS.includes(url.origin);
  await page.route(hold, async (route) => {
    await held;
    // A request of a page already reloaded away has nobody left to answer.
    await route.fallback().catch(() => undefined);
  });
  await page.goto(signUrl(state.siteUrl, toPayload(checkIn)));
  await captureScreens(page, 'sign-checking', {
    ready: async () => {
      await expect(page.getByTestId('sign-checking')).toBeVisible();
      await atTop(page, { wallet: false });
    },
  });
  gate.open?.();
  await page.unroute(hold);

  // Signed: a check-in through wallet_sendCalls, then the Receipt. Every shot reloads the page, so ready signs again.
  await page.goto(signUrl(state.siteUrl, toPayload(checkIn)));
  await connectFrom(page, cardConnect(page));
  await captureScreens(page, 'sign-done', {
    ready: async () => {
      const done = page.getByTestId('sign-tx-done');
      if (!(await done.isVisible())) {
        // A later block for each check-in, as the bundle test does.
        await warp(state, 30);
        await expect(page.getByTestId('sign-tx-send')).toBeEnabled();
        await page.getByTestId('sign-tx-send').click();
        await expect(done).toBeVisible();
      }
      await expect(page.getByTestId('sign-open-vault')).toBeVisible();
      await atTop(page);
    },
  });

  // Would fail: a check-in signed by someone who does not own the vault.
  const stranger = ANVIL[4];
  w.setAccount(stranger);
  await page.goto(signUrl(state.siteUrl, { ...toPayload(checkIn), from: stranger }));
  await captureScreens(page, 'sign-sim-failed', {
    ready: async () => {
      await expect(page.getByTestId('sign-sim-error')).toHaveAttribute('data-code', /.+/);
      await atTop(page, { wallet: false });
    },
  });

  const vote = await atro
    .vault(state.seeded.guarded)
    .prepare({ type: 'voteRecovery', target: ANVIL[6] }, { as: ANVIL[3] });
  w.setAccount(ANVIL[3]);
  await page.goto(signUrl(state.siteUrl, toPayload(vote)));
  // Every shot reloads the page, which forgets what was typed: ready types the wrong wallet again, so the gate shows
  // its error next to the mirror.
  await captureScreens(page, 'sign-vote', {
    ready: async () => {
      const field = page.getByTestId('sign-vote-target-0');
      await expect(field).toBeVisible();
      if ((await field.inputValue()) === '') await field.fill(ANVIL[7]);
      await expect(page.getByTestId('sign-vote-target-0-error')).toBeVisible();
      await atTop(page);
    },
  });

  w.setAccount(OWNER);
  const drill = await drillPlan(atro, ANVIL[2]);
  await page.goto(signUrl(state.siteUrl, toPayload(drill)));
  await captureScreens(page, 'sign-drill', {
    ready: async () => {
      const field = page.getByTestId('sign-confirm-0');
      await expect(field).toBeVisible();
      if ((await field.inputValue()) === '') await field.fill(ANVIL[2].toLowerCase());
      await expect(page.getByTestId('sign-tx-send')).toBeEnabled();
      await atTop(page);
    },
  });

  await page.goto(signUrl(state.siteUrl, outsideWhitelist(atro)));
  await captureScreens(page, 'sign-refused', {
    ready: async () => {
      await expect(page.getByTestId('sign-refused')).toBeVisible();
      await atTop(page);
    },
  });

  await page.goto(`${new URL('sign/', state.siteUrl).href}#p=AAAAAAAAAAAA`);
  await captureScreens(page, 'sign-invalid', {
    ready: async () => {
      await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'LINK_INVALID');
      await atTop(page);
    },
  });
});
