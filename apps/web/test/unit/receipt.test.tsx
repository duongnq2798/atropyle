import { type SentStep, STATE_CODES, type TxPlan, type VaultEvent } from '@atropyle/sdk';
import { screen, within } from '@testing-library/react';
import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { Receipt } from '../../src/tx/receipt';
import {
  hashGroups,
  type ReceiptStep,
  receiptBase,
  receiptGroups,
  STATE_BY_CODE,
  stateChanges,
} from '../../src/tx/receipt-view';
import { applyStep, txView } from '../../src/tx/tx-view';
import { renderWithProviders } from '../helpers/render';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const H1 = `0x${'ab12'.repeat(16)}` as Hex;
const H2 = `0x${'cd34'.repeat(16)}` as Hex;
const EXPLORER = 'https://www.oklink.com/xlayer';
const changed = (from: number, to: number, hash: Hex = H1): VaultEvent => ({
  address: V,
  name: 'StateChanged',
  args: { from, to },
  blockNumber: 12n,
  logIndex: 0,
  transactionHash: hash,
});
const step = (
  index: number,
  hash: Hex,
  events: VaultEvent[] = [],
  time: bigint | null = 1_800_000_000n,
): ReceiptStep => ({
  index,
  action: 'checkIn',
  hash,
  blockNumber: 12_345n,
  time,
  events,
});
const PLAN: TxPlan = {
  chainId: 196,
  from: A,
  vault: V,
  summary: '',
  warnings: [],
  steps: [0, 1].map(() => ({
    chainId: 196,
    from: A,
    to: V,
    data: '0x183ff085',
    value: 0n,
    action: 'checkIn' as const,
    summary: 's',
    warnings: [],
    simulation: { ok: true as const, gas: 1n },
  })),
};

describe('receipt view', () => {
  it('holds the SDK state codes', () => {
    for (const [name, code] of Object.entries(STATE_CODES)) expect(STATE_BY_CODE[code]).toBe(name);
    expect(Object.keys(STATE_BY_CODE)).toHaveLength(Object.keys(STATE_CODES).length);
  });

  it('reads StateChanged only, and only codes that name a state', () => {
    const other: VaultEvent = { ...changed(1, 0), name: 'CheckedIn' };
    expect(stateChanges([changed(1, 0), other, changed(2, 9), changed(0, 1)])).toEqual([
      { from: 'grace', to: 'active' },
      { from: 'active', to: 'grace' },
    ]);
  });

  it('merges the rows of every send with the steps of the last one, in plan order', () => {
    let v = applyStep(txView(PLAN), { index: 0, phase: 'confirmed', hash: H1 });
    v = applyStep(v, { index: 1, phase: 'confirmed', hash: H2 });
    const known: SentStep[] = [{ index: 1, action: 'checkIn', hash: H2, blockNumber: 9n, gasUsed: 1n, events: [] }];
    expect(receiptBase(PLAN, v.rows, known)).toEqual([
      { index: 0, action: 'checkIn', hash: H1, blockNumber: null, time: null, events: [] },
      { index: 1, action: 'checkIn', hash: H2, blockNumber: 9n, time: null, events: [] },
    ]);
  });

  it('one transaction for several steps (a bundle) is one entry', () => {
    const groups = receiptGroups([step(0, H1), step(1, H1, [changed(1, 0)]), step(2, H2)]);
    expect(groups.map((g) => [g.hash, g.steps.length, g.events.length])).toEqual([
      [H1, 2, 1],
      [H2, 1, 0],
    ]);
  });

  it('cuts a hash in groups of four', () => {
    expect(hashGroups(`0x${'1234'.repeat(16)}`)).toEqual(Array(16).fill('1234'));
  });
});

describe('Receipt', () => {
  it('says what happened, what the circuit decided, and where to check it', () => {
    renderWithProviders(
      <Receipt
        steps={[step(0, H1, [changed(1, 0)])]}
        titles={['Check in']}
        explorer={EXPLORER}
        testId="tx"
        footer={<span data-testid="footer">next</span>}
      />,
    );
    const done = screen.getByTestId('tx-done');
    // The card's own heading says it is done; the Receipt repeats no title of its own.
    expect(within(done).queryByRole('heading')).toBeNull();
    expect(within(done).queryByText('Recorded on chain')).toBeNull();
    // Each step once, behind a tied knot, under the id and phase its row had.
    const line = within(done).getByTestId('tx-step-0');
    expect(line.getAttribute('data-phase')).toBe('confirmed');
    expect(line.textContent).toBe('Check in');
    expect(line.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    const decided = within(done).getByTestId('tx-decided');
    expect([...decided.querySelectorAll('[data-state]')].map((e) => e.getAttribute('data-state'))).toEqual([
      'grace',
      'active',
    ]);
    expect(decided.textContent).toContain('The circuit decided');
    expect(decided.textContent).toContain('to');
    expect(within(done).getByText('12,345')).toBeTruthy();
    expect(within(done).getByText('2027-01-15 08:00 UTC')).toBeTruthy();
    const entry = within(done).getByTestId('tx-receipt-0');
    expect(entry.getAttribute('data-hash')).toBe(H1);
    // Drawn in groups for the eye, read once in full by a screen reader.
    const drawn = entry.querySelector('[aria-hidden="true"][data-part="hash"]');
    expect(drawn?.textContent).toBe(H1);
    expect(within(entry).getByText(H1)).toBeTruthy();
    // A fixed grid, never free wrapping: "0x" hangs in its own column, and every row of groups starts in column 2
    // (four rows of four in a narrow receipt, two rows of eight from 32rem). No group can sit alone on a line.
    expect(drawn?.className).toContain('inline-grid');
    expect(drawn?.className).not.toContain('wrap-anywhere');
    expect(drawn?.querySelectorAll('wbr')).toHaveLength(0);
    const cells = [...(drawn?.children ?? [])];
    expect(cells).toHaveLength(17);
    expect(cells[0]?.textContent).toBe('0x');
    expect(cells[0]?.className).toContain('text-ink-muted');
    const starts = cells.slice(1).map((c) => c.className);
    expect(starts.flatMap((c, i) => (c.split(' ').includes('col-start-2') ? [i] : []))).toEqual([4, 8, 12]);
    expect(starts.flatMap((c, i) => (c.includes('@lg:col-start-auto') ? [i] : []))).toEqual([4, 12]);
    expect(
      within(done)
        .getByRole('link', { name: /View on OKLink/ })
        .getAttribute('href'),
    ).toBe(`${EXPLORER}/tx/${H1}`);
    expect(within(done).getByTestId('footer')).toBeTruthy();
  });

  it('says it in Vietnamese', () => {
    renderWithProviders(
      <Receipt steps={[step(0, H1, [changed(1, 0)])]} titles={['Điểm danh']} explorer={null} testId="tx" />,
      { lang: 'vi' },
    );
    const decided = screen.getByTestId('tx-decided');
    expect(decided.textContent).toContain('Circuit đã quyết');
    expect(decided.textContent).toContain('thành');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a block still being read says so; a time that could not be read shows a dash', () => {
    const { rerender } = renderWithProviders(
      <Receipt steps={[step(0, H1, [], null)]} titles={['Check in']} explorer={null} reading testId="tx" />,
    );
    expect(screen.getByText('Reading the block…')).toBeTruthy();
    rerender(<Receipt steps={[step(0, H1, [], null)]} titles={['Check in']} explorer={null} testId="tx" />);
    expect(screen.queryByText('Reading the block…')).toBeNull();
  });
});
