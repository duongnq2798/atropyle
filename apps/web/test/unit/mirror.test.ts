import { factoryAbi, type PreparedTx, type TxPlan, vaultAbi } from '@atropyle/sdk';
import {
  type Abi,
  type Address,
  concatHex,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  type Hex,
  maxUint256,
  toFunctionSelector,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { FUNCTIONS, mirrorPlan } from '../../src/tx/impl/mirror';
import { isRevoke, type MirrorContext, mirrorDangers } from '../../src/tx/mirror';
import { stepTitleKey } from '../../src/tx/step-title';

const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const VAULT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const FACTORY = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const USDG = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';
const NFT = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
const ITEMS = '0x0165878A594ca255338adfa4d48449f69242Eb8F';
const THIEF = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';
const ZERO = '0x0000000000000000000000000000000000000000';

const CONTEXT: MirrorContext = {
  factory: FACTORY,
  feeTokens: [USDG],
  tokens: [
    { address: NFT, kind: 'erc721', symbol: 'DEMO', decimals: null },
    { address: ITEMS, kind: 'erc1155', symbol: 'ITEMS', decimals: null },
  ],
};

function step(to: Address, data: Hex, summary = 'Check in on your vault.', value = 0n): PreparedTx {
  return {
    chainId: 196,
    from: OWNER,
    to,
    data,
    value,
    action: 'approve',
    summary,
    warnings: [],
    simulation: { ok: true, gas: 50_000n },
  };
}

const planOf = (...steps: PreparedTx[]): TxPlan => ({
  chainId: 196,
  from: OWNER,
  vault: VAULT,
  steps,
  summary: '',
  warnings: [],
});
const approve = (spender: Address, amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
const forAll = (operator: Address, on: boolean) =>
  encodeFunctionData({ abi: erc721Abi, functionName: 'setApprovalForAll', args: [operator, on] });
const one = (s: PreparedTx) => mirrorPlan(planOf(s), CONTEXT)[0];

describe('mirrorPlan (R18.8)', () => {
  it('reads the function, the contract and the approval from the calldata, whatever the summary says', () => {
    const data = approve(THIEF, maxUint256);
    const c = one(step(USDG, data, 'Check in on your vault.'));
    expect(c).toMatchObject({
      fn: 'approve',
      known: true,
      to: USDG,
      role: 'feeToken',
      approval: { kind: 'erc20', spender: THIEF, spenderRole: 'other', unlimited: true },
    });
    expect(mirrorDangers(c)).toEqual(['unlimited', 'unknownSpender']);
    // The title comes from the decoded call too: an allowance to a stranger, never "Check in".
    expect(stepTitleKey({ action: 'checkIn', data }, c)).toBe('apprUnknown');
  });

  it('an ERC-721 approve names the token id; approving the zero address revokes it', () => {
    const grant = one(step(NFT, approve(VAULT, 2n)));
    expect(grant.approval).toEqual({ kind: 'erc721', spender: VAULT, spenderRole: 'vault', id: 2n });
    expect(grant.token?.symbol).toBe('DEMO');
    expect(stepTitleKey({ action: 'approve', data: approve(VAULT, 2n) }, grant)).toBe('apprNft');
    const clear = one(step(NFT, approve(ZERO, 2n)));
    expect(clear.approval && isRevoke(clear.approval)).toBe(true);
    expect(stepTitleKey({ action: 'approve', data: approve(ZERO, 2n) }, clear)).toBe('apprNftOff');
  });

  it('setApprovalForAll on an ERC-1155 collection covers all of it; false revokes', () => {
    const on = one(step(ITEMS, forAll(VAULT, true)));
    expect(on.approval).toEqual({ kind: 'all', operator: VAULT, spenderRole: 'vault', on: true });
    expect(mirrorDangers(on)).toEqual(['all']);
    expect(stepTitleKey({ action: 'setApprovalForAll', data: forAll(VAULT, true) }, on)).toBe('apprAll');
    const off = one(step(ITEMS, forAll(VAULT, false)));
    expect(off.approval && isRevoke(off.approval)).toBe(true);
    expect(mirrorDangers(off)).toEqual([]);
    expect(stepTitleKey({ action: 'setApprovalForAll', data: forAll(VAULT, false) }, off)).toBe('apprAllOff');
  });

  it('ERC-20: the fee to the factory, the asset to the vault, unlimited, and a revoke of 0', () => {
    const fee = one(step(USDG, approve(FACTORY, 5_000_000n)));
    expect(fee.approval).toMatchObject({ kind: 'erc20', spenderRole: 'factory', amount: 5_000_000n, unlimited: false });
    expect(stepTitleKey({ action: 'approve', data: approve(FACTORY, 5_000_000n) }, fee)).toBe('apprFee');
    const max = one(step(USDG, approve(VAULT, maxUint256)));
    expect(mirrorDangers(max)).toEqual(['unlimited']);
    expect(stepTitleKey({ action: 'approve', data: approve(VAULT, maxUint256) }, max)).toBe('apprToken');
    const revoke = one(step(USDG, approve(VAULT, 0n)));
    expect(revoke.approval && isRevoke(revoke.approval)).toBe(true);
    expect(stepTitleKey({ action: 'approve', data: approve(VAULT, 0n) }, revoke)).toBe('apprTokenOff');
  });

  it('takes the asset kind from the vault list only: approve on a contract it does not list stays unknown', () => {
    const c = one(step(THIEF, approve(VAULT, 7n)));
    expect(c.approval).toEqual({ kind: 'unknown', spender: VAULT, spenderRole: 'vault', raw: 7n });
    expect(c.role).toBe('other');
    expect(mirrorDangers(c)).toEqual(['unknownContract', 'unknownCall']);
  });

  it('ignores the bytes of a builder code after the arguments', () => {
    const data = concatHex([approve(VAULT, 9n), '0x61747279706c6580218021']);
    expect(one(step(USDG, data)).approval).toMatchObject({ kind: 'erc20', amount: 9n });
  });

  it('names a function it does not know by its selector', () => {
    const c = one(step(VAULT, '0xdeadbeef'));
    expect(c).toMatchObject({ fn: '0xdeadbeef', known: false, role: 'vault', approval: null });
    expect(mirrorDangers(c)).toEqual(['unknownCall']);
  });

  it('decodes the wallet a vote names; the zero address takes the vote back', () => {
    const vote = encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [THIEF] });
    expect(one(step(VAULT, vote)).vote).toBe(THIEF);
    const back = encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [ZERO] });
    expect(stepTitleKey({ action: 'voteRecovery', data: back }, one(step(VAULT, back)))).toBe('actVoteWithdraw');
    expect(stepTitleKey({ action: 'voteRecovery', data: vote }, one(step(VAULT, vote)))).toBe('actVoteRecovery');
  });

  it('knows every write of the vault and the factory, and both approvals, by name', () => {
    // Widened to Abi: neither ABI has a pure function today, which TypeScript would otherwise read as a fact.
    for (const f of [...vaultAbi, ...factoryAbi] as Abi) {
      if (f.type !== 'function' || f.stateMutability === 'view' || f.stateMutability === 'pure') continue;
      expect(FUNCTIONS.get(toFunctionSelector(f))).toBe(f.name);
    }
    expect(FUNCTIONS.get('0x095ea7b3')).toBe('approve');
    expect(FUNCTIONS.get('0xa22cb465')).toBe('setApprovalForAll');
  });

  it('reads the value sent and the role of the factory', () => {
    const c = one(step(FACTORY, '0xdc350bf8', 'x', 10n ** 18n));
    expect(c).toMatchObject({ fn: 'createVault', role: 'factory', value: 10n ** 18n, approval: null });
  });

  it('without a decoded call, an approval gets the neutral title of its action', () => {
    expect(stepTitleKey({ action: 'approve', data: approve(VAULT, 1n) }, null)).toBe('actApprove');
    expect(stepTitleKey({ action: 'checkIn', data: '0x183ff085' }, null)).toBe('actCheckIn');
  });
});
