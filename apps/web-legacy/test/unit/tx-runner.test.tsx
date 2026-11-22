// @vitest-environment happy-dom
import { AtropyleError, type PreparedTx, type SendResult, type TxPlan } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function harness(
  send: (p: TxPlan, w: unknown, o: { onStep?: (e: unknown) => void }) => Promise<SendResult>,
  onProgress?: (p: { confirmed: number; committed: boolean }) => void,
  link: (p: TxPlan, base: string) => string = () => 'https://example.test/#/sign?p=x',
) {
  const value = {
    lang: 'en',
    env: { docsPath: null },
    sdk: {
      atro: { chain: { id: 196 }, send, handoff: { link } },
      deployment: { explorerUrl: null },
    },
    wallet: { account: A, chainId: 196 },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  return (
    <AppContext.Provider value={value}>
      <TxRunner plan={plan} label="Send" onProgress={onProgress} />
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

  it('asks before the page unloads only while a sent plan is unfinished', async () => {
    const leaving = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    let attempt = 0;
    const send = async (p: TxPlan, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      attempt++;
      if (attempt === 1) {
        o.onStep?.({ index: 0, total: p.steps.length, step: p.steps[0], phase: 'confirmed', hash: H });
        throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
      }
      for (const [index, s] of p.steps.entries()) {
        o.onStep?.({ index, total: p.steps.length, step: s, phase: 'confirmed', hash: H });
      }
      return { vault: V as `0x${string}`, steps: [] };
    };
    const { unmount } = render(harness(send));
    expect(leaving()).toBe(false);
    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-send').textContent).toBe('Resume from step 2'));
    await waitFor(() => expect(leaving()).toBe(true));
    fireEvent.click(screen.getByTestId('tx-send'));
    await screen.findByTestId('tx-done');
    // Preact runs effects after paint.
    await waitFor(() => expect(leaving()).toBe(false));
    unmount();
    expect(leaving()).toBe(false);
  });

  it('drops its unload guard when it unmounts mid-plan', async () => {
    const send = async (p: TxPlan, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      o.onStep?.({ index: 0, total: p.steps.length, step: p.steps[0], phase: 'confirmed', hash: H });
      throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
    };
    const { unmount } = render(harness(send));
    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-send').textContent).toBe('Resume from step 2'));
    unmount();
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('hands off only the steps that are not confirmed yet', async () => {
    const writeText = vi.fn(async (_t: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const link = vi.fn((p: TxPlan) => `https://example.test/#/sign?steps=${p.steps.map((s) => s.summary).join(',')}`);
    const send = async (p: TxPlan, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      o.onStep?.({ index: 0, total: p.steps.length, step: p.steps[0], phase: 'confirmed', hash: H });
      throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
    };
    render(harness(send, undefined, link));
    fireEvent.click(screen.getByTestId('tx-copy-link'));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('https://example.test/#/sign?steps=one,two,three'));

    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-send').textContent).toBe('Resume from step 2'));
    // A hand-off of the whole plan would make the next signer send step 1 again.
    const last = link.mock.calls.at(-1)?.[0];
    expect(last?.steps.map((s) => s.summary)).toEqual(['two', 'three']);
    expect(last).toMatchObject({ chainId: plan.chainId, from: plan.from, vault: plan.vault });
    fireEvent.click(screen.getByTestId('tx-copy-link'));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('https://example.test/#/sign?steps=two,three'));
  });

  it('shows how many steps are confirmed, and only when there is more than one', async () => {
    const reported: { confirmed: number; committed: boolean }[] = [];
    let attempt = 0;
    const send = async (p: TxPlan, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      attempt++;
      const total = p.steps.length;
      if (attempt === 1) {
        o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'confirmed', hash: H });
        throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
      }
      for (let index = 0; index < p.steps.length; index++) {
        o.onStep?.({ index, total, step: p.steps[index], phase: 'confirmed', hash: H });
      }
      return { vault: V as `0x${string}`, steps: [] };
    };
    render(harness(send, (p) => reported.push(p)));
    const bar = () => screen.getByTestId('tx-progress') as HTMLProgressElement;
    expect([bar().value, bar().max]).toEqual([0, 3]);
    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-step-1').getAttribute('data-phase')).toBe('failed'));
    expect(bar().value).toBe(1);
    expect(reported.at(-1)).toEqual({ confirmed: 1, committed: true });
    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-done')).toBeTruthy());
    expect(bar().value).toBe(3);
    expect(reported.at(-1)).toEqual({ confirmed: 3, committed: true });
    expect(reported.map((r) => r.confirmed)).toEqual(expect.arrayContaining([0, 1, 3]));
  });

  it('is committed while a send is in flight and free again after a rejection with no hash', async () => {
    const reported: { confirmed: number; committed: boolean }[] = [];
    let reject: (e: unknown) => void = () => {};
    const send = (_p: TxPlan, _w: unknown, o: { onStep?: (e: unknown) => void }) =>
      new Promise<SendResult>((_, no) => {
        o.onStep?.({ index: 0, total: 3, step: plan.steps[0], phase: 'signing' });
        reject = no;
      });
    render(harness(send, (p) => reported.push(p)));
    expect(reported.at(-1)).toEqual({ confirmed: 0, committed: false });
    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(reported.at(-1)?.committed).toBe(true));
    reject(new AtropyleError('USER_REJECTED', { details: { index: 0, completed: 0 } }));
    await waitFor(() => expect(reported.at(-1)).toEqual({ confirmed: 0, committed: false }));
  });

  it('stays committed after a failure that follows a pending step with a hash', async () => {
    const reported: { confirmed: number; committed: boolean }[] = [];
    const send = async (_p: TxPlan, _w: unknown, o: { onStep?: (e: unknown) => void }) => {
      o.onStep?.({ index: 0, total: 3, step: plan.steps[0], phase: 'signing' });
      o.onStep?.({ index: 0, total: 3, step: plan.steps[0], phase: 'pending', hash: H });
      throw new AtropyleError('UNKNOWN', { details: { index: 0, completed: 0 } });
    };
    render(harness(send, (p) => reported.push(p)));
    fireEvent.click(screen.getByTestId('tx-send'));
    await waitFor(() => expect(screen.getByTestId('tx-step-0').getAttribute('data-phase')).toBe('failed'));
    expect(reported.at(-1)).toEqual({ confirmed: 0, committed: true });
  });
});
