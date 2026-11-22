import { encodePayload, type SignPayload, toPayload } from '@atropyle/sdk';
import { encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { ANVIL, expect, test } from './fixtures.ts';
import { warp } from './state.ts';

const OWNER = ANVIL[1];

test('a valid link is checked and signed through wallet_sendCalls', async ({ page, atro, state, wallet }) => {
  const vault = state.seeded.simple;
  await warp(state, 30);
  const before = (await atro.vault(vault).status()).lastAlive;
  const plan = await atro.vault(vault).prepare({ type: 'checkIn' }, { as: OWNER });
  const w = await wallet({ account: OWNER, sendCalls: true });
  await page.goto(atro.handoff.link(plan, state.siteUrl));
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('sign-step-0')).toHaveAttribute('data-allowed', 'true');
  await page.getByTestId('sign-send').click();
  await expect(page.getByTestId('sign-done')).toBeVisible();
  expect(w.calls.map((c) => c.method)).toContain('wallet_sendCalls');
  expect((await atro.vault(vault).status()).lastAlive).toBeGreaterThan(before);
});

test('a guardian signs a vote link only after typing the wallet it votes for', async ({
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
  await page.goto(atro.handoff.link(plan, state.siteUrl));
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('sign-step-0')).toHaveAttribute('data-allowed', 'true');
  await expect(page.getByTestId('sign-step-0').locator('.badge')).toHaveText('Check before you sign');
  await expect(page.getByTestId('sign-step-0').locator('.badge-ok')).toHaveCount(0);
  await expect(page.getByTestId('sign-guardian')).toBeVisible();
  await expect(page.getByTestId('sign-vote-target-0')).toHaveValue('');
  await expect(page.getByTestId('sign-send')).toBeDisabled();

  await page.getByTestId('sign-vote-target-0').fill(ANVIL[7]);
  await expect(page.getByTestId('sign-vote-target-0-error')).toHaveAttribute('data-reason', 'mismatch');
  await expect(page.getByTestId('sign-send')).toBeDisabled();
  await page.getByTestId('sign-vote-target-0').fill(target.toLowerCase());
  await expect(page.getByTestId('sign-send')).toBeEnabled();
  expect(w.calls.map((c) => c.method)).not.toContain('eth_sendTransaction');
  await page.getByTestId('sign-send').click();
  await expect(page.getByTestId('sign-done')).toBeVisible();
  expect((await atro.vault(vault).status()).recVotes).toContainEqual({ guardian, target });
});

test('a tampered link is refused', async ({ page, atro, state, wallet }) => {
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
  await page.goto(`${state.siteUrl}#/sign?p=${encodePayload(tampered)}`);
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('sign-refused')).toBeVisible();
  await expect(page.getByTestId(`sign-step-${approve}`)).toHaveAttribute('data-allowed', 'false');
  await expect(page.getByTestId('sign-send')).toHaveCount(0);
  expect(w.calls.map((c) => c.method)).not.toContain('wallet_sendCalls');
  expect(w.calls.map((c) => c.method)).not.toContain('eth_sendTransaction');
});

test('calls to contracts outside the whitelist are refused', async ({ page, atro, state, wallet }) => {
  const token = atro.deployment.feeTokens[0];
  const p: SignPayload = {
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
  await wallet({ account: OWNER });
  await page.goto(`${state.siteUrl}#/sign?p=${encodePayload(p)}`);
  await expect(page.getByTestId('sign-refused')).toBeVisible();
  await expect(page.getByTestId('sign-step-0')).toHaveAttribute('data-allowed', 'false');
  await expect(page.getByTestId('sign-step-1')).toHaveAttribute('data-allowed', 'false');
  await expect(page.getByTestId('sign-send')).toHaveCount(0);
});

test('a corrupt link shows LINK_INVALID', async ({ page, state }) => {
  await page.goto(`${state.siteUrl}#/sign?p=AAAAAAAAAAAA`);
  await expect(page.getByTestId('sign-invalid')).toBeVisible();
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'LINK_INVALID');
});

test('wrong account and wrong chain', async ({ page, atro, state, wallet }) => {
  const vault = state.seeded.simple;
  const plan = await atro.vault(vault).prepare({ type: 'checkIn' }, { as: OWNER });
  const w = await wallet({ account: ANVIL[4], chainId: 1 });
  await page.goto(atro.handoff.link(plan, state.siteUrl));
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('sign-wrong-account')).toBeVisible();
  await expect(page.getByTestId('sign-send')).toHaveCount(0);
  await expect(page.getByTestId('wrong-network')).toBeVisible();

  w.setAccount(OWNER);
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('sign-send')).toHaveText(/Switch network and sign/);
  await page.getByTestId('sign-send').click();
  await expect(page.getByTestId('sign-done')).toBeVisible();
  const add = w.calls.find((c) => c.method === 'wallet_addEthereumChain');
  expect(add?.params[0]).toMatchObject({ chainId: '0x7a69' });
  expect(w.calls.map((c) => c.method)).toContain('eth_sendTransaction');
});
