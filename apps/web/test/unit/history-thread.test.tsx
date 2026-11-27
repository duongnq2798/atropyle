import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryEntry, HistoryThread } from '../../src/app/vault/history-thread';
import type { Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import type { HistoryTx } from '../../src/flows/impl/history';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

const TX: HistoryTx = {
  hash: `0x${'1'.repeat(64)}`,
  blockNumber: 12n,
  logIndex: 0,
  at: null,
  rows: [{ logIndex: 0, kind: 'alarm', state: 'grace', target: null }],
  decided: [{ from: 'active', to: 'grace' }],
};

describe('a transaction in the history', () => {
  it('says what the circuit decided, as two state badges', () => {
    renderWithProviders(
      <ol>
        <HistoryEntry tx={TX} index={0} explorer={null} />
      </ol>,
    );
    const chip = screen.getByTestId('vault-history-0-decided-0');
    expect(chip.textContent).toContain('Decided by the circuit');
    expect([...chip.querySelectorAll('[data-state]')].map((e) => e.getAttribute('data-state'))).toEqual([
      'active',
      'grace',
    ]);
    expect(screen.getByTestId('vault-history-0').getAttribute('data-kind')).toBe('alarm');
    expect(screen.getByText('block 12')).toBeTruthy();
  });

  it('in Vietnamese too', () => {
    renderWithProviders(
      <ol>
        <HistoryEntry tx={TX} index={0} explorer={null} />
      </ol>,
      { lang: 'vi' },
    );
    expect(screen.getByTestId('vault-history-0-decided-0').textContent).toContain('Circuit đã quyết');
  });
});

describe('the history section', () => {
  it('keeps focus in the section when "Show recent history" leaves the page', async () => {
    const historyWindow = vi.fn(async () => ({ txs: [TX], fromBlock: 0n, toBlock: 12n, more: false }));
    const sdk = { atro: {}, deployment: { explorerUrl: null, factoryBlock: 0n } } as unknown as Sdk;
    renderWithProviders(<HistoryThread flows={{ ...flows, historyWindow } as never} sdk={sdk} vault={PEOPLE.vault} />);
    fireEvent.click(screen.getByTestId('vault-history-load'));
    expect(screen.queryByTestId('vault-history-load')).toBeNull();
    expect(document.activeElement?.id).toBe('vault-history-title');
    await waitFor(() => expect(screen.getByTestId('vault-history-0')).toBeTruthy());
    expect(historyWindow).toHaveBeenCalledWith(sdk.atro, PEOPLE.vault, null, 0n);
    expect(document.activeElement?.id).toBe('vault-history-title');
  });
});
