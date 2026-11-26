import { describe, expect, it } from 'vitest';
import type { HealthResponse } from '../../src/api/types';
import { healthRows } from '../../src/app/status/health';
import { HealthList, HealthSkeleton } from '../../src/app/status/status-page';
import { renderWithProviders } from '../helpers/render';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();
const MIXED: HealthResponse = {
  indexer: { block: '5000', lagBlocks: 1, updatedAt: ago(60) },
  integrity: { at: ago(600), block: '4990', ok: true },
  // 0.004 OKB: low on gas.
  keeper: { lastRunAt: ago(120), balanceWei: '4000000000000000', dryRun: false },
};

describe('the backend rows on the hosted /status/', () => {
  it('draw the rows of the check list: a divided list, the verdict on the right with a dot, numbers in the ledger voice', () => {
    const { container } = renderWithProviders(<HealthList rows={healthRows(MIXED, NOW)} />);
    const list = container.querySelector('ul');
    expect(list?.className).toContain('divide-y');
    const rows = [...container.querySelectorAll('li')];
    expect(rows.map((r) => r.getAttribute('data-tone'))).toEqual(['ok', 'ok', 'warn']);
    for (const r of rows) {
      expect(r.className).toContain('py-3');
      // Colour is never the only signal: a word, and a dot beside it that a screen reader skips.
      const verdict = r.querySelector('[data-health-verdict]');
      expect(verdict?.textContent).toMatch(/^(OK|Attention)$/);
      expect(verdict?.querySelector('[aria-hidden="true"]')?.className).toContain('rounded-full');
    }
    const ledger = [...container.querySelectorAll('.voice-ledger')].map((e) => e.textContent);
    expect(ledger).toEqual(expect.arrayContaining(['5,000', '10 minutes', '4,990', '0.0040']));
    expect(container.textContent).toContain('one block behind the chain');
    expect(container.textContent).not.toContain('1 blocks');
  });

  it('keeps the shape of those rows while the backend is asked', () => {
    const { container } = renderWithProviders(<HealthSkeleton />);
    const sk = container.querySelector('[data-testid="status-health-skeleton"]');
    expect(sk?.getAttribute('aria-hidden')).toBe('true');
    expect(sk?.querySelectorAll('li')).toHaveLength(3);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Checking…');
  });
});
