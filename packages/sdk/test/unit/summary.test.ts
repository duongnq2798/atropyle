import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/prepare/summary';
import { HEIR_A, HEIR_B, NFT, OWNER, TOKEN, VAULT } from './fixtures';

describe('summaries', () => {
  it('spell out full addresses, amounts and durations', () => {
    expect(summarize.checkIn(VAULT)).toBe(
      `Check in as the owner of vault ${VAULT}: this resets the inactivity timer and clears pending guardian votes.`,
    );
    expect(summarize.approve20(VAULT, TOKEN, 1_500_000n, 6)).toBe(
      `Allow vault ${VAULT} to move up to 1.5 (1500000 base units) of ERC-20 token ${TOKEN}.`,
    );
    expect(summarize.approve20(VAULT, TOKEN, null, 6)).toBe(
      `Allow vault ${VAULT} to move an unlimited amount of ERC-20 token ${TOKEN}.`,
    );
    expect(summarize.approve721(VAULT, NFT, 1n)).toBe(`Allow vault ${VAULT} to move ERC-721 token ${NFT} #1.`);
    expect(summarize.setTiming(VAULT, { period: 2592000, threshold: 6, window: 1209600 })).toBe(
      `Set the timing of vault ${VAULT}: check in every 30d, alarm after 6 missed check-ins, 14d alarm window.`,
    );
    expect(
      summarize.setHeirs(VAULT, [
        { account: HEIR_A, bps: 7000 },
        { account: HEIR_B, bps: 3000 },
      ]),
    ).toBe(`Replace the heirs of vault ${VAULT}: ${HEIR_A} 70%, ${HEIR_B} 30%.`);
    expect(summarize.voteRecovery(VAULT, OWNER)).toContain(`new wallet ${OWNER}`);
    expect(summarize.voteRecovery(VAULT, null)).toBe(`As guardian, withdraw your recovery vote for vault ${VAULT}.`);
  });

  it('describes a vault creation in one sentence', () => {
    const s = summarize.createVault(VAULT, OWNER, {
      drill: false,
      heirs: [
        { account: HEIR_A, bps: 6667 },
        { account: HEIR_B, bps: 3333 },
      ],
      guardians: [HEIR_A, NFT, TOKEN],
      k: 2,
      recoveryEnabled: true,
      timing: { period: 2592000, threshold: 6, window: 1209600 },
      assets: [{ kind: 'erc20', token: TOKEN, id: 0n, heir: 0 }],
      fee: 1_990_000n,
      feeToken: TOKEN,
      feeDecimals: 6,
    });
    expect(s).toBe(
      `Create vault ${VAULT} for ${OWNER}: 2 heirs (${HEIR_A} 66.67%, ${HEIR_B} 33.33%), 2 of 3 guardians must confirm, wallet recovery on, check in every 30d, alarm after 6 missed check-ins, 14d window, 1 asset, fee 1.99 of token ${TOKEN}.`,
    );
  });
});
