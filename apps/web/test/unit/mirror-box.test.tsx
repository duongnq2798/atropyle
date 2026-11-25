import type { PreparedTx, TxPlan } from '@atropyle/sdk';
import { screen, within } from '@testing-library/react';
import { type Address, encodeFunctionData, erc20Abi, erc721Abi, type Hex, maxUint256 } from 'viem';
import { describe, expect, it } from 'vitest';
import { mirrorPlan } from '../../src/tx/impl/mirror';
import type { MirrorContext } from '../../src/tx/mirror';
import { MirrorBox } from '../../src/tx/mirror-box';
import { renderWithProviders } from '../helpers/render';

const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const VAULT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const USDG = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';
const NFT = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
const ITEMS = '0x0165878A594ca255338adfa4d48449f69242Eb8F';
const ZERO = '0x0000000000000000000000000000000000000000';
const CONTEXT: MirrorContext = {
  factory: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  feeTokens: [],
  tokens: [
    { address: USDG, kind: 'erc20', symbol: { untrusted: true, value: 'USDG\u202E', truncated: false }, decimals: 6 },
    { address: NFT, kind: 'erc721', symbol: 'DEMO', decimals: null },
    { address: ITEMS, kind: 'erc1155', symbol: 'ITEMS', decimals: null },
  ],
};
const stepOf = (to: Address, data: Hex, action: PreparedTx['action']): PreparedTx => ({
  chainId: 196,
  from: OWNER,
  to,
  data,
  value: 0n,
  action,
  summary: 'z',
  warnings: [],
  simulation: { ok: true, gas: 1n },
});
/** An ERC-721 grant to the vault, then the three revocations: an NFT to the zero address, an allowance of 0, false. */
const REVOKES: TxPlan = {
  chainId: 196,
  from: OWNER,
  vault: VAULT,
  summary: '',
  warnings: [],
  steps: [
    stepOf(NFT, encodeFunctionData({ abi: erc721Abi, functionName: 'approve', args: [VAULT, 2n] }), 'approve'),
    stepOf(NFT, encodeFunctionData({ abi: erc721Abi, functionName: 'approve', args: [ZERO, 2n] }), 'approve'),
    stepOf(USDG, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [VAULT, 0n] }), 'approve'),
    stepOf(
      ITEMS,
      encodeFunctionData({ abi: erc721Abi, functionName: 'setApprovalForAll', args: [VAULT, false] }),
      'setApprovalForAll',
    ),
  ],
};
const PLAN: TxPlan = {
  chainId: 196,
  from: OWNER,
  vault: VAULT,
  summary: '',
  warnings: [],
  steps: [
    {
      chainId: 196,
      from: OWNER,
      to: USDG,
      value: 0n,
      action: 'approve',
      summary: 'x',
      warnings: [],
      simulation: { ok: true, gas: 1n },
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [VAULT, maxUint256] }),
    },
    {
      chainId: 196,
      from: OWNER,
      to: ITEMS,
      value: 0n,
      action: 'setApprovalForAll',
      summary: 'y',
      warnings: [],
      simulation: { ok: true, gas: 1n },
      data: encodeFunctionData({ abi: erc721Abi, functionName: 'setApprovalForAll', args: [VAULT, true] }),
    },
  ],
};

describe('MirrorBox', () => {
  it('shows one call as the wallet should, with its danger lines and the last word', () => {
    const [first] = mirrorPlan(PLAN, CONTEXT);
    renderWithProviders(<MirrorBox calls={[first]} explorer={null} testId="tx" />);
    const box = screen.getByTestId('tx-mirror-0');
    expect(within(box).getByText('Your wallet should show')).toBeTruthy();
    expect(within(box).getByText('X Layer (196)')).toBeTruthy();
    expect(within(box).getByText('approve')).toBeTruthy();
    expect(box.querySelector(`[data-address="${USDG}"]`)).not.toBeNull();
    expect(within(box).getByText('Unlimited')).toBeTruthy();
    // The symbol was read from the chain: a text node, cleaned of its bidi override.
    expect(within(box).getByTestId('tx-mirror-0-token').querySelector('[data-untrusted]')?.textContent).toBe('USDG');
    // The native coin is this page's own word, not chain text: plain, exact, and shown even when nothing is sent.
    expect(within(box).getByTestId('tx-mirror-0-sends').textContent).toBe('0 OKB');
    expect([...box.querySelectorAll('[data-untrusted]')].map((e) => e.textContent)).toEqual(['USDG']);
    expect(within(box).getByTestId('tx-mirror-0-danger-unlimited')).toBeTruthy();
    expect(within(box).getByTestId('tx-mirror-reject').textContent).toBe(
      'If your wallet shows anything else, reject it.',
    );
  });

  it('a bundle lists every call, in Vietnamese too', () => {
    renderWithProviders(<MirrorBox calls={mirrorPlan(PLAN, CONTEXT)} explorer={null} testId="tx" bundle />, {
      lang: 'vi',
    });
    const box = screen.getByTestId('tx-mirror-bundle');
    expect(within(box).getByText('Ví của bạn phải hiện 2 lệnh này cùng lúc')).toBeTruthy();
    // One bundle goes to one network: the wallet names it once, and so does the mirror.
    expect(within(box).getAllByText('X Layer (196)')).toHaveLength(1);
    expect(within(box).getByTestId('tx-mirror-0')).toBeTruthy();
    expect(within(box).getByTestId('tx-mirror-1-danger-all')).toBeTruthy();
    expect(within(box).getByText('MỌI token của bộ này')).toBeTruthy();
    expect(within(box).getByTestId('tx-mirror-reject').textContent).toBe(
      'Nếu ví hiện bất cứ điều gì khác, hãy từ chối.',
    );
  });

  it('an ERC-721 grant names its id, and the three revocations say so with no danger line', () => {
    renderWithProviders(<MirrorBox calls={mirrorPlan(REVOKES, CONTEXT)} explorer={null} testId="tx" bundle />);
    const box = screen.getByTestId('tx-mirror-bundle');
    const row = (i: number) => within(within(box).getByTestId(`tx-mirror-${i}`));
    expect(row(0).getByText('NFT #2')).toBeTruthy();
    expect(row(0).getByText('this vault')).toBeTruthy();
    expect(row(1).getByText('No one, for NFT #2: this removes the permission')).toBeTruthy();
    // A revocation to the zero address names no spender.
    expect(row(1).queryByText('Spender')).toBeNull();
    expect(row(2).getByText('Nothing: this removes the permission')).toBeTruthy();
    expect(row(3).getByText('None of this collection: this removes the permission')).toBeTruthy();
    // A grant to this vault of a listed NFT and the three revocations: nothing in the danger tone but the last word.
    expect(within(box).queryAllByTestId(/^tx-mirror-\d+-danger-/)).toHaveLength(0);
    expect(within(box).getByTestId('tx-mirror-reject')).toBeTruthy();
  });
});
