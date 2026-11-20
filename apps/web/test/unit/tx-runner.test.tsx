// @vitest-environment happy-dom
import { AtropyleError, type PreparedTx, type SendResult, type TxPlan } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContext } from '../../src/ui/app-context';
import { TxRunner } from '../../src/ui/tx-runner';

afterEach(cleanup);

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;
const H = `0x${'12'.repeat(32)}` as const;

function step(summary: string): PreparedTx {
  return {
    chainId: 196,
    from: A,
    to: V,
    data: '0x',
    value: 0n,
    action: 'checkIn',
    summary,
    warnings: [],
    simulation: { ok: true, gas: 50_000n },
  };
}

const plan: TxPlan = {
  chainId: 196,
  from: A,
  vault: V,
  steps: [step('one'), step('two'), step('three')],
  summary: 'Plan',
  warnings: [],
};

function harness(send: (p: TxPlan, w: unknown, o: { onStep?: (e: unknown) => void }) => Promise<SendResult>) {
  const value = {
    lang: 'en',
    env: { docsPath: null },
    sdk: {
      atro: { chain: { id: 196 }, send, handoff: { link: () => 'https://example.test/#/sign?p=x' } },
      deployment: { explorerUrl: null },
    },
    wallet: { account: A, chainId: 196 },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  return (
    <AppContext.Provider value={value}>
      <TxRunner plan={plan} label="Send" />
    </AppContext.Provider>
  );
}

describe('TxRunner', () => {
  it('resumes after a partial failure without signing confirmed steps again', async () => {
    const seen: string[][] = [];
    let attempt = 0;
    const send = async (p: TxPlan, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      seen.push(p.steps.map((s) => s.summary));
      attempt++;
      const total = p.steps.length;
      if (attempt === 1) {
        o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'signing' });
        o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'confirmed', hash: H });
        o.onStep?.({ index: 1, total, step: p.steps[1], phase: 'signing' });
        throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
      }
      for (const index of [0, 1]) {
        o.onStep?.({ index, total, step: p.steps[index], phase: 'confirmed', hash: H });
      }
      return { vault: V as `0x${string}`, steps: [] };
    };
    render(harness(send));
    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-step-1').getAttribute('data-phase')).toBe('failed'));
    expect(screen.getByTestId('tx-step-0').getAttribute('data-phase')).toBe('confirmed');
    expect(screen.getByTestId('tx-send').textContent).toBe('Resume from step 2');

    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-done')).toBeTruthy());
    expect(seen).toEqual([
      ['one', 'two', 'three'],
      ['two', 'three'],
    ]);
    expect(screen.getByTestId('tx-step-0').getAttribute('data-phase')).toBe('confirmed');
    expect(screen.getByTestId('tx-step-1').getAttribute('data-phase')).toBe('confirmed');
    expect(screen.getByTestId('tx-step-2').getAttribute('data-phase')).toBe('confirmed');
  });

  it('shows how many steps are confirmed, and only when there is more than one', async () => {
    let attempt = 0;
    const send = async (p: TxPlan, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      attempt++;
      const total = p.steps.length;
      o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'confirmed', hash: H });
      if (attempt === 1) throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
      for (const index of [1, 2]) o.onStep?.({ index, total, step: p.steps[index], phase: 'confirmed', hash: H });
      return { vault: V as `0x${string}`, steps: [] };
    };
    render(harness(send));
    const bar = () => screen.getByTestId('tx-progress') as HTMLProgressElement;
    expect([bar().value, bar().max]).toEqual([0, 3]);
    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-step-1').getAttribute('data-phase')).toBe('failed'));
    expect(bar().value).toBe(1);
    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-done')).toBeTruthy());
    expect(bar().value).toBe(3);
  });
});
