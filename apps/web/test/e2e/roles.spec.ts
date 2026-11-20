import { erc20Abi } from 'viem';
import { ANVIL, expect, test } from './fixtures.ts';
import { warp } from './state.ts';

test('a guardian votes for a new wallet only after typing it twice', async ({ page, state, atro, wallet }) => {
  const vault = state.seeded.guarded;
  const guardian = ANVIL[3];
  const target = ANVIL[6];
  await wallet({ account: guardian });
  // A link that tries to pre-fill the vote must not fill anything.
  await page.goto(`${state.siteUrl}#/v/${vault}?target=${ANVIL[8]}`);
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('guardian-panel')).toBeVisible();
  await expect(page.getByTestId('guardian-warning')).toContainText(
    'confirm the request through a channel you already trust',
  );
  await expect(page.getByTestId('guardian-power')).toContainText(
    '2 guardians who agree, you included, can move everything',
  );
  await expect(page.getByTestId('guardian-target')).toHaveValue('');
  await expect(page.getByTestId('guardian-target-again')).toHaveValue('');

  await page.getByTestId('guardian-target').fill(target);
  await page.getByTestId('guardian-target-again').fill(ANVIL[7]);
  await expect(page.getByTestId('guardian-target-error')).toHaveAttribute('data-reason', 'mismatch');
  await expect(page.getByTestId('guardian-vote')).toBeDisabled();

  await page.getByTestId('guardian-target-again').fill(target.toLowerCase());
  await page.getByTestId('guardian-vote').click();
  await expect(page.getByTestId('warning-GUARDIAN_VERIFY_OUT_OF_BAND')).toBeVisible();
  await page.getByTestId('guardian-vote-tx-send').click();
  await expect(page.getByTestId('guardian-vote-tx-done')).toBeVisible();

  expect((await atro.vault(vault).status()).recVotes).toContainEqual({ guardian, target });
  await expect(page.getByTestId(`guardian-row-${guardian.toLowerCase()}`)).toHaveAttribute('data-target', target);
  await expect(page.getByTestId(`guardian-tally-${target.toLowerCase()}`)).toContainText('1 of 2 votes');
});

test('an heir raises the alarm, then claims and sees each transfer', async ({ page, state, atro, wallet }) => {
  const vault = state.seeded.grace;
  const heir = ANVIL[2];
  const usdg = atro.deployment.feeTokens[2];
  const balance = () =>
    atro.publicClient.readContract({ address: usdg, abi: erc20Abi, functionName: 'balanceOf', args: [heir] });
  const before = await balance();
  await warp(state, 200);
  await wallet({ account: heir });
  await page.goto(`${state.siteUrl}#/v/${vault}`);
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('vault-state')).toHaveAttribute('data-state', 'grace');
  await expect(page.getByTestId('heir-panel')).toBeVisible();
  await expect(page.getByTestId('guardian-panel')).toHaveCount(0);
  await expect(page.getByTestId('owner-panel')).toHaveCount(0);

  await page.getByTestId('heir-poke').click();
  await page.getByTestId('heir-poke-tx-send').click();
  await expect(page.getByTestId('vault-state')).toHaveAttribute('data-state', 'releasedInherit');

  await page.getByTestId('heir-claim').click();
  await page.getByTestId('heir-claim-tx-send').click();
  await expect(page.getByTestId('heir-claim-tx-done')).toBeVisible();
  await expect(page.getByTestId('heir-results-0')).toHaveAttribute('data-ok', 'true');
  const distributed = (await atro.vault(vault).events()).filter((e) => e.name === 'Distributed');
  expect(distributed).toHaveLength(1);
  const paid = distributed[0].args.amountOrId;
  expect(typeof paid === 'bigint' && paid > 0n).toBe(true);
  expect((await balance()) - before).toBe(paid);

  await page.getByTestId('heir-history').click();
  await expect(page.getByTestId('heir-history-list-0')).toHaveAttribute('data-ok', 'true');
});

test('a guardian confirms the death and the confirmation is recorded on chain', async ({
  page,
  state,
  atro,
  wallet,
}) => {
  const vault = state.seeded.guarded;
  const guardian = ANVIL[4];
  expect((await atro.vault(vault).status()).inhVoters).toEqual([]);
  await wallet({ account: guardian });
  await page.goto(`${state.siteUrl}#/v/${vault}`);
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('guardian-panel')).toBeVisible();
  await page.getByTestId('guardian-attest').click();
  await expect(page.getByTestId('warning-GUARDIAN_VERIFY_OUT_OF_BAND')).toBeVisible();
  await page.getByTestId('guardian-attest-tx-send').click();
  await expect(page.getByTestId('guardian-attest-tx-done')).toBeVisible();
  expect((await atro.vault(vault).status()).inhVoters).toEqual([guardian]);
  await expect(page.getByTestId(`guardian-row-${guardian.toLowerCase()}`)).toHaveAttribute('data-attested', 'true');
});
