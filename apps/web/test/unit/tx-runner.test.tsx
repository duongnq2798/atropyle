import { AtropyleError, type PreparedTx, type TxPlan } from '@atropyle/sdk';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Hex, WalletClient } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TxCard } from '../../src/tx/tx-card';
import { type TxRunner, useTxRunner } from '../../src/tx/use-tx-runner';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import { renderWithProviders } from '../helpers/render';
import { walletValue } from '../helpers/wallet';

const fake = vi.hoisted(() => ({ send: vi.fn(), link: vi.fn() }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: () => ({
      deployment: { explorerUrl: null },
      atro: { chain: { id: 196 }, send: fake.send, handoff: { link: fake.link } },
      rpc: { read: [], verify: [] },
    }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});

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

type OnStep = (e: unknown) => void;
type Options = { onStep?: OnStep };
interface Seen {
  confirmed: number;
  committed: boolean;
}

function Harness({ plan, onRunner }: { plan: TxPlan; onRunner(r: TxRunner): void }) {
  const runner = useTxRunner({ plan });
  onRunner(runner);
  return <TxCard runner={runner} label="Send" />;
}

function setup(o: { wallet?: Partial<WalletValue> } = {}) {
  const reported: Seen[] = [];
  let latest: TxRunner | null = null;
  const value = walletValue(o.wallet);
  const onRunner = (r: TxRunner) => {
    latest = r;
    const last = reported.at(-1);
    if (!last || last.confirmed !== r.confirmed || last.committed !== r.committed) {
      reported.push({ confirmed: r.confirmed, committed: r.committed });
    }
  };
  const ui = (p: TxPlan) => (
    <WalletContext value={value}>
      <Harness plan={p} onRunner={onRunner} />
    </WalletContext>
  );
  const utils = renderWithProviders(ui(plan));
  const runner = (): TxRunner => {
    if (!latest) throw new Error('not rendered');
    return latest;
  };
  return { ...utils, reported, runner, show: (p: TxPlan) => utils.rerender(ui(p)) };
}

const sendButton = () => screen.getByTestId('tx-send') as HTMLButtonElement;
const phase = (i: number) => screen.getByTestId(`tx-step-${i}`).getAttribute('data-phase');

/** The SDK chunk loads after the first render; until then the button waits. */
async function ready() {
  await waitFor(() => expect(sendButton().disabled).toBe(false));
}

function leaving(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

/** First call: step 0 confirmed, then the wallet declines step 1. Later calls: every step confirmed. */
function failOnceAtStep1() {
  let attempt = 0;
  return async (p: TxPlan, _w: unknown, o: Options) => {
    attempt++;
    const total = p.steps.length;
    if (attempt === 1) {
      o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'confirmed', hash: H });
      throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
    }
    for (const [index, s] of p.steps.entries()) o.onStep?.({ index, total, step: s, phase: 'confirmed', hash: H });
    return { vault: V, steps: [] };
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  fake.link.mockImplementation(
    (p: TxPlan, base: string) => `${base}#/sign?steps=${p.steps.map((s) => s.summary).join(',')}`,
  );
});

describe('useTxRunner with TxCard', () => {
  it('resumes after a partial failure without signing confirmed steps again', async () => {
    const seen: string[][] = [];
    let attempt = 0;
    fake.send.mockImplementation(async (p: TxPlan, _w: unknown, o: Options) => {
      seen.push(p.steps.map((s) => s.summary));
      attempt++;
      const total = p.steps.length;
      if (attempt === 1) {
        o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'signing' });
        o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'confirmed', hash: H });
        o.onStep?.({ index: 1, total, step: p.steps[1], phase: 'signing' });
        throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
      }
      for (const index of [0, 1]) o.onStep?.({ index, total, step: p.steps[index], phase: 'confirmed', hash: H });
      return { vault: V, steps: [] };
    });
    setup();
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(1)).toBe('failed'));
    expect(phase(0)).toBe('confirmed');
    expect(sendButton().textContent).toBe('Resume from step 2');
    await waitFor(() => expect(screen.getByTestId('error').getAttribute('data-code')).toBe('USER_REJECTED'));

    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(seen).toEqual([
      ['one', 'two', 'three'],
      ['two', 'three'],
    ]);
    expect([phase(0), phase(1), phase(2)]).toEqual(['confirmed', 'confirmed', 'confirmed']);
    expect(screen.queryByTestId('error')).toBeNull();
  });

  it('asks before the page unloads only while a sent plan is unfinished', async () => {
    fake.send.mockImplementation(failOnceAtStep1());
    const { unmount } = setup();
    await ready();
    expect(leaving()).toBe(false);
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().textContent).toBe('Resume from step 2'));
    await waitFor(() => expect(leaving()).toBe(true));
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    await waitFor(() => expect(leaving()).toBe(false));
    unmount();
    expect(leaving()).toBe(false);
  });

  it('drops its unload guard when it unmounts mid-plan', async () => {
    fake.send.mockImplementation(failOnceAtStep1());
    const { unmount } = setup();
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().textContent).toBe('Resume from step 2'));
    unmount();
    expect(leaving()).toBe(false);
  });

  it('opens no further wallet prompt once its card is gone', async () => {
    const prompts: Array<(hash: Hex) => void> = [];
    const sendTransaction = vi.fn(
      () =>
        new Promise<Hex>((resolve) => {
          prompts.push(resolve);
        }),
    );
    let sending: Promise<unknown> = Promise.resolve();
    // Shaped like the SDK's sendPlan: one wallet prompt per step, through the client it is given.
    fake.send.mockImplementation((p: TxPlan, w: WalletClient, o: Options) => {
      sending = (async () => {
        const total = p.steps.length;
        for (const [index, s] of p.steps.entries()) {
          o.onStep?.({ index, total, step: s, phase: 'signing' });
          const hash = await w.sendTransaction({ index } as never);
          o.onStep?.({ index, total, step: s, phase: 'confirmed', hash });
        }
        return { vault: V, steps: [] };
      })();
      return sending;
    });
    const { unmount } = setup({
      wallet: { walletClient: async () => ({ sendTransaction }) as unknown as WalletClient },
    });
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendTransaction).toHaveBeenCalledTimes(1));
    await act(async () => prompts[0]?.(H));
    await waitFor(() => expect(sendTransaction).toHaveBeenCalledTimes(2));
    expect(phase(0)).toBe('confirmed');

    // A link in the header: the page unmounts with step 2's prompt open, and no beforeunload fires.
    unmount();
    // The prompt that was already open is approved; step 3 must not open one for a page that is gone.
    prompts[1]?.(H);
    await new Promise((r) => setTimeout(r, 20));
    expect(sendTransaction).toHaveBeenCalledTimes(2);
    await expect(sending).rejects.toMatchObject({ code: 'USER_REJECTED' });
  });

  it('hands off only the steps that are not confirmed yet, on the sign page, and nothing once all are', async () => {
    const writeText = vi.fn(async (_t: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fake.send.mockImplementation(failOnceAtStep1());
    setup();
    await ready();
    const copy = () => {
      const button = screen.getByTestId('tx-copy-link').querySelector('button');
      if (!button) throw new Error('no copy button');
      fireEvent.click(button);
    };
    copy();
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/sign/#steps=one,two,three`));
    expect(fake.link).toHaveBeenLastCalledWith(expect.objectContaining({ from: A }), `${location.origin}/`);

    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().textContent).toBe('Resume from step 2'));
    // A hand-off of the whole plan would make the next signer send step 1 again.
    const last = fake.link.mock.calls.at(-1)?.[0] as TxPlan;
    expect(last.steps.map((s) => s.summary)).toEqual(['two', 'three']);
    expect(last).toMatchObject({ chainId: plan.chainId, from: plan.from, vault: plan.vault });
    copy();
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/sign/#steps=two,three`));

    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(screen.queryByTestId('tx-copy-link')).toBeNull();
  });

  it('counts the confirmed steps', async () => {
    fake.send.mockImplementation(failOnceAtStep1());
    const { reported } = setup();
    await ready();
    const bar = () => screen.getByTestId('tx-progress');
    expect([bar().getAttribute('value'), bar().getAttribute('max')]).toEqual(['0', '3']);
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(1)).toBe('failed'));
    expect(bar().getAttribute('value')).toBe('1');
    expect(reported.at(-1)).toEqual({ confirmed: 1, committed: true });
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(bar().getAttribute('value')).toBe('3');
    expect(reported.at(-1)).toEqual({ confirmed: 3, committed: true });
    expect(reported.map((r) => r.confirmed)).toEqual(expect.arrayContaining([0, 1, 3]));
  });

  it('is committed while a send is in flight and free again after a rejection with no hash', async () => {
    let reject: (e: unknown) => void = () => undefined;
    fake.send.mockImplementation(
      (_p: TxPlan, _w: unknown, o: Options) =>
        new Promise((_, no) => {
          o.onStep?.({ index: 0, total: 3, step: plan.steps[0], phase: 'signing' });
          reject = no;
        }),
    );
    const { reported } = setup();
    expect(reported.at(-1)).toEqual({ confirmed: 0, committed: false });
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(reported.at(-1)?.committed).toBe(true));
    await waitFor(() => expect(phase(0)).toBe('signing'));
    reject(new AtropyleError('USER_REJECTED', { details: { index: 0, completed: 0 } }));
    await waitFor(() => expect(reported.at(-1)).toEqual({ confirmed: 0, committed: false }));
  });

  it('stays committed after a failure that follows a pending step with a hash', async () => {
    fake.send.mockImplementation(async (_p: TxPlan, _w: unknown, o: Options) => {
      o.onStep?.({ index: 0, total: 3, step: plan.steps[0], phase: 'signing' });
      o.onStep?.({ index: 0, total: 3, step: plan.steps[0], phase: 'pending', hash: H });
      throw new AtropyleError('UNKNOWN', { details: { index: 0, completed: 0 } });
    });
    const { reported } = setup();
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(0)).toBe('failed'));
    expect(reported.at(-1)).toEqual({ confirmed: 0, committed: true });
  });

  it('sends once, however often send is called while it runs', async () => {
    fake.send.mockImplementation(() => new Promise(() => undefined));
    const { runner } = setup();
    await ready();
    act(() => {
      runner().send();
      runner().send();
    });
    await waitFor(() => expect(fake.send).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(fake.send).toHaveBeenCalledTimes(1);
  });

  it('moves the wallet to the right chain before it asks for a signature', async () => {
    const order: string[] = [];
    fake.send.mockImplementation(async () => {
      order.push('send');
      return { vault: V, steps: [] };
    });
    setup({
      wallet: {
        wrongChain: true,
        switchChain: async () => {
          order.push('switch');
        },
        walletClient: async () => {
          order.push('client');
          return {} as WalletClient;
        },
      },
    });
    expect(screen.getByText('Your wallet will first ask to switch to X Layer.')).toBeTruthy();
    await ready();
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(order).toEqual(['switch', 'client', 'send']);
  });

  it('a new plan starts clean', async () => {
    fake.send.mockRejectedValue(new AtropyleError('USER_REJECTED', { details: { index: 0, completed: 0 } }));
    const { show } = setup();
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(0)).toBe('failed'));
    await screen.findByTestId('error');
    show({ ...plan, steps: [step('only')] });
    expect(phase(0)).toBe('ready');
    expect(screen.queryByTestId('tx-step-1')).toBeNull();
    expect(screen.queryByTestId('tx-progress')).toBeNull();
    expect(screen.queryByTestId('error')).toBeNull();
    expect(sendButton().textContent).toBe('Send');
  });
});
