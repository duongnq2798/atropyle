import { type PreparedTx, type TxPlan, vaultAbi } from '@atropyle/sdk';
import { encodeFunctionData, getAbiItem, toFunctionSelector } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  IRREVERSIBLE,
  planIsIrreversible,
  stepIsIrreversible,
  VOTE_RECOVERY_SELECTOR,
  voteWithdraws,
} from '../../src/tx/irreversible';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ZERO = '0x0000000000000000000000000000000000000000';
const vote = (target: `0x${string}`) =>
  encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [target] });
const s = (action: PreparedTx['action'], data: `0x${string}` = '0x'): PreparedTx => ({
  chainId: 196,
  from: A,
  to: A,
  data,
  value: 0n,
  action,
  summary: '',
  warnings: [],
  simulation: { ok: true, gas: 1n },
});
const planOf = (...steps: PreparedTx[]): TxPlan => ({
  chainId: 196,
  from: A,
  vault: A,
  steps,
  summary: '',
  warnings: [],
});

describe('irreversible steps (spec §5.4)', () => {
  it('reads the voteRecovery selector the vault ABI has', () => {
    expect(toFunctionSelector(getAbiItem({ abi: vaultAbi, name: 'voteRecovery' }))).toBe(VOTE_RECOVERY_SELECTOR);
  });

  it('a vault, a payout and a vote for a wallet cannot be undone; taking a vote back can', () => {
    expect([...IRREVERSIBLE].sort()).toEqual(['createVault', 'distribute', 'voteRecovery']);
    expect(stepIsIrreversible(s('createVault'))).toBe(true);
    expect(stepIsIrreversible(s('distribute'))).toBe(true);
    expect(stepIsIrreversible(s('voteRecovery', vote(A)))).toBe(true);
    expect(voteWithdraws(vote(ZERO))).toBe(true);
    expect(stepIsIrreversible(s('voteRecovery', vote(ZERO)))).toBe(false);
    expect(stepIsIrreversible(s('checkIn'))).toBe(false);
    // Bytes that do not decode as a withdrawal count as a vote: the label errs on the side of caution.
    expect(stepIsIrreversible(s('voteRecovery', '0x1234'))).toBe(true);
  });

  it('a plan is irreversible only when every step is', () => {
    expect(planIsIrreversible(planOf(s('distribute')))).toBe(true);
    expect(planIsIrreversible(planOf(s('approve'), s('createVault')))).toBe(false);
    expect(planIsIrreversible(planOf())).toBe(false);
  });
});
