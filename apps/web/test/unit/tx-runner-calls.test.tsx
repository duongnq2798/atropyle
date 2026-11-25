import { AtropyleError, type PreparedTx, type SendResult, type TxPlan } from '@atropyle/sdk';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Hex } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TxCard } from '../../src/tx/tx-card';
import { type TxRunner, type TxRunnerOptions, useTxRunner } from '../../src/tx/use-tx-runner';
import type { Eip1193 } from '../../src/wallet/impl/wallet';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import { renderWithProviders } from '../helpers/render';
import { walletValue } from '../helpers/wallet';

const fake = vi.hoisted(() => ({
  send: vi.fn(),
  receipt: vi.fn(),
  block: vi.fn(),
  sdkFails: { value: false },
}));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: () => {
      if (fake.sdkFails.value) throw new Error('the SDK chunk did not load');
      return {
        deployment: { explorerUrl: null, factory: '0x1111111111111111111111111111111111111111', feeTokens: [] },
        atro: {
          chain: { id: 196 },
          send: fake.send,
          deployment: { factory: '0x1111111111111111111111111111111111111111' },
          handoff: {
            link: () => 'https://atropyle.test/sign/#p=x',
            calls: (p: TxPlan) => ({
              version: '2.0.0',
              chainId: '0xc4',
              from: p.from,
              atomicRequired: false,
              calls: p.steps.map((s) => ({ to: s.to, data: s.data, value: '0x0' })),
            }),
          },
          publicClient: {
            waitForTransactionReceipt: fake.receipt,
            getTransactionReceipt: fake.receipt,
            getBlock: fake.block,
          },
        },
        rpc: { read: [], verify: [] },
      };
    },
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const H1 = `0x${'11'.repeat(32)}` as Hex;
const H2 = `0x${'22'.repeat(32)}` as Hex;
type Options = { onStep?: (e: unknown) => void };

function step(summary: string): PreparedTx {
  return {
    chainId: 196,
    from: A,
    to: V,
    data: '0x183ff085',
    value: 0n,
    action: 'checkIn',
    summary,
    warnings: [],
    simulation: { ok: true, gas: 50_000n },
  };
}
const plan2: TxPlan = { chainId: 196, from: A, vault: V, steps: [step('one'), step('two')], summary: '', warnings: [] };
const plan1: TxPlan = { ...plan2, steps: [step('only')] };

const ok = (hash: Hex) => ({
  transactionHash: hash,
  from: A,
  to: V,
  status: 'success',
  blockNumber: 5n,
  gasUsed: 1n,
  logs: [],
});
const reverted = (hash: Hex) => ({ ...ok(hash), status: 'reverted' });

/** An EIP-5792 wallet: capabilities for chain 196, wallet_sendCalls, and a status the test controls. */
function batchWallet(o: { caps?: () => unknown; sendCalls?: () => unknown; status?: () => unknown } = {}) {
  const methods: string[] = [];
  const provider: Eip1193 = {
    async request({ method }) {
      methods.push(method);
      if (method === 'wallet_getCapabilities')
        return o.caps ? o.caps() : { '0xc4': { atomic: { status: 'supported' } } };
      if (method === 'wallet_sendCalls') return o.sendCalls ? o.sendCalls() : { id: 'bundle-1' };
      if (method === 'wallet_getCallsStatus')
        return o.status ? o.status() : { status: 200, receipts: [{ transactionHash: H1 }, { transactionHash: H2 }] };
      throw Object.assign(new Error(`unexpected ${method}`), { code: 4200 });
    },
  };
  return { provider, methods, count: (m: string) => methods.filter((x) => x === m).length };
}

function withProvider(provider: Eip1193 | null): WalletValue {
  const base = walletValue();
  if (!provider || !base.wallet) return base;
  return walletValue({ wallet: { ...base.wallet, option: { ...base.wallet.option, provider } } });
}

function Harness(p: { o: TxRunnerOptions; onRunner(r: TxRunner): void }) {
  const runner = useTxRunner(p.o);
  p.onRunner(runner);
  return <TxCard runner={runner} label="Send" />;
}

function setup(o: { plan?: TxPlan; provider?: Eip1193 | null; onDone?: (r: SendResult) => void } = {}) {
  let latest: TxRunner | null = null;
  const value = withProvider(o.provider ?? null);
  const ui = (plan: TxPlan) => (
    <WalletContext value={value}>
      <Harness o={{ plan, onDone: o.onDone }} onRunner={(r) => (latest = r)} />
    </WalletContext>
  );
  const utils = renderWithProviders(ui(o.plan ?? plan2));
  const runner = () => {
    if (!latest) throw new Error('not rendered');
    return latest;
  };
  return { ...utils, runner, show: (p: TxPlan) => utils.rerender(ui(p)) };
}

const sendButton = () => screen.getByTestId('tx-send') as HTMLButtonElement;
const phase = (i: number) => screen.getByTestId(`tx-step-${i}`).getAttribute('data-phase');
const ready = () => waitFor(() => expect(sendButton().disabled).toBe(false));
function leaving(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

beforeEach(() => {
  vi.resetAllMocks();
  fake.sdkFails.value = false;
  fake.receipt.mockImplementation(async ({ hash }: { hash: Hex }) => ok(hash));
  fake.block.mockResolvedValue({ timestamp: 1_800_000_000n });
});

describe('useTxRunner: one send path with wallet_sendCalls', () => {
  it('bundles the steps, mirrors every call, and settles from its own receipts', async () => {
    const w = batchWallet();
    const onDone = vi.fn();
    setup({ provider: w.provider, onDone });
    await ready();
    const bundle = await screen.findByTestId('tx-mirror-bundle');
    expect(within(bundle).getAllByText('checkIn')).toHaveLength(2);
    fireEvent.click(sendButton());
    const done = await screen.findByTestId('tx-done');
    expect(fake.send).not.toHaveBeenCalled();
    expect(w.count('wallet_sendCalls')).toBe(1);
    expect([phase(0), phase(1)]).toEqual(['confirmed', 'confirmed']);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect((onDone.mock.calls[0][0] as SendResult).steps.map((s) => s.index)).toEqual([0, 1]);
    await waitFor(() => expect(within(done).getAllByText('2027-01-15 08:00 UTC')).toHaveLength(2));
  });

  it('falls back to one step at a time when the wallet refuses wallet_sendCalls', async () => {
    const w = batchWallet({
      sendCalls: () => {
        throw Object.assign(new Error('unsupported'), { code: 4200 });
      },
    });
    fake.send.mockImplementation(async (p: TxPlan, _w: unknown, o: Options) => {
      for (const [index, s] of p.steps.entries())
        o.onStep?.({ index, total: 2, step: s, phase: 'confirmed', hash: H1 });
      return { vault: V, steps: [] };
    });
    setup({ provider: w.provider });
    await ready();
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect((fake.send.mock.calls[0][0] as TxPlan).steps).toHaveLength(2);
  });

  it('holds a bundle the wallet has not settled, sends nothing again, and settles it on Check again', async () => {
    let settled = false;
    const w = batchWallet({
      status: () =>
        settled ? { status: 200, receipts: [{ transactionHash: H1 }, { transactionHash: H2 }] } : { status: 600 },
    });
    setup({ provider: w.provider });
    await ready();
    fireEvent.click(sendButton());
    const banner = await screen.findByTestId('tx-unsettled');
    expect(banner.getAttribute('data-kind')).toBe('bundle');
    expect(within(banner).getByText('bundle-1')).toBeTruthy();
    expect(screen.queryByTestId('tx-send')).toBeNull();
    expect(screen.queryByTestId('tx-copy-link')).toBeNull();
    expect(screen.queryByTestId('tx-error')).toBeNull();
    expect(leaving()).toBe(true);
    settled = true;
    fireEvent.click(screen.getByTestId('tx-recheck'));
    await screen.findByTestId('tx-done');
    expect(w.count('wallet_sendCalls')).toBe(1);
  });

  it('goes on one step at a time after a bundle failed part-way', async () => {
    const w = batchWallet({
      status: () => ({ status: 500, receipts: [{ transactionHash: H1 }, { transactionHash: H2 }] }),
    });
    fake.receipt.mockImplementation(async ({ hash }: { hash: Hex }) => (hash === H2 ? reverted(hash) : ok(hash)));
    fake.send.mockImplementation(async (p: TxPlan, _w: unknown, o: Options) => {
      o.onStep?.({ index: 0, total: p.steps.length, step: p.steps[0], phase: 'confirmed', hash: H2 });
      return { vault: V, steps: [] };
    });
    setup({ provider: w.provider });
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(1)).toBe('failed'));
    expect(phase(0)).toBe('confirmed');
    expect(sendButton().textContent).toBe('Resume from step 2');
    expect(await screen.findByTestId('tx-mirror-1')).toBeTruthy();
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect((fake.send.mock.calls[0][0] as TxPlan).steps.map((s) => s.summary)).toEqual(['two']);
    expect(w.count('wallet_sendCalls')).toBe(1);
  });

  it('a step sent but not read is "sent, not known yet": nothing is sent again until the chain answers', async () => {
    fake.send.mockImplementation(async (p: TxPlan, _w: unknown, o: Options) => {
      o.onStep?.({ index: 0, total: 1, step: p.steps[0], phase: 'pending', hash: H1 });
      throw new AtropyleError('UNKNOWN', { details: { index: 0, completed: 0, hash: H1 } });
    });
    fake.receipt
      .mockRejectedValueOnce(new Error('not found'))
      .mockImplementation(async ({ hash }: { hash: Hex }) => ok(hash));
    setup({ plan: plan1, provider: null });
    await ready();
    fireEvent.click(sendButton());
    const banner = await screen.findByTestId('tx-unsettled');
    expect(banner.getAttribute('data-kind')).toBe('step');
    expect(phase(0)).toBe('pending');
    expect(screen.queryByTestId('tx-send')).toBeNull();
    fireEvent.click(screen.getByTestId('tx-recheck'));
    await screen.findByTestId('tx-done');
    expect(fake.send).toHaveBeenCalledTimes(1);
  });

  it('a hash only the SDK error names still keeps the step sent, not ready to send again', async () => {
    fake.send.mockImplementation(async (p: TxPlan, _w: unknown, o: Options) => {
      o.onStep?.({ index: 0, total: 1, step: p.steps[0], phase: 'signing' });
      throw new AtropyleError('UNKNOWN', { details: { index: 0, completed: 0, hash: H1 } });
    });
    fake.receipt.mockRejectedValue(new Error('not found'));
    setup({ plan: plan1, provider: null });
    await ready();
    fireEvent.click(sendButton());
    expect((await screen.findByTestId('tx-unsettled')).getAttribute('data-kind')).toBe('step');
    expect(phase(0)).toBe('pending');
    expect(screen.queryByTestId('tx-send')).toBeNull();
    expect(leaving()).toBe(true);
  });

  it('a step that reverted on chain fails for good, and may be sent again', async () => {
    fake.send.mockImplementation(async (p: TxPlan, _w: unknown, o: Options) => {
      o.onStep?.({ index: 0, total: 1, step: p.steps[0], phase: 'pending', hash: H1 });
      throw new AtropyleError('UNKNOWN', { details: { index: 0, completed: 0, hash: H1 } });
    });
    fake.receipt.mockImplementation(async ({ hash }: { hash: Hex }) => reverted(hash));
    setup({ plan: plan1, provider: null });
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(0)).toBe('failed'));
    expect(screen.queryByTestId('tx-unsettled')).toBeNull();
    expect(await screen.findByTestId('tx-error')).toBeTruthy();
    expect(sendButton().disabled).toBe(false);
  });

  it('opens no wallet_sendCalls once the card is gone', async () => {
    let answer: (v: unknown) => void = () => undefined;
    let asked = 0;
    const w = batchWallet({
      caps: () => {
        asked++;
        // The card's own check on connect answers at once; the one right before the send waits.
        return asked === 1 ? { '0xc4': {} } : new Promise((r) => (answer = r));
      },
    });
    const { unmount } = setup({ provider: w.provider });
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(asked).toBe(2));
    unmount();
    await act(async () => {
      answer({ '0xc4': {} });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(w.count('wallet_sendCalls')).toBe(0);
  });

  it('holds a newer plan while a send runs and while the receipt shows, until adopt()', async () => {
    let finish: (r: unknown) => void = () => undefined;
    let late: Options['onStep'];
    fake.send.mockImplementation(
      (p: TxPlan, _w: unknown, o: Options) =>
        new Promise((resolve) => {
          late = o.onStep;
          finish = () => {
            for (const [index, s] of p.steps.entries())
              o.onStep?.({ index, total: 2, step: s, phase: 'confirmed', hash: H1 });
            resolve({ vault: V, steps: [] });
          };
        }),
    );
    const { show, runner } = setup({ provider: null });
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(runner().busy).toBe(true));
    show(plan1);
    expect(screen.getByTestId('tx-step-1')).toBeTruthy();
    expect(runner().stale).toBe(true);
    await act(async () => finish(null));
    await screen.findByTestId('tx-done');
    expect(screen.getByTestId('tx-step-1')).toBeTruthy();
    act(() => runner().adopt());
    expect(screen.queryByTestId('tx-step-1')).toBeNull();
    expect(screen.queryByTestId('tx-done')).toBeNull();
    // A late report from the old send lands nowhere.
    act(() => late?.({ index: 0, total: 2, step: plan2.steps[0], phase: 'confirmed', hash: H2 }));
    expect(phase(0)).toBe('ready');
  });

  it('calls onDone once, and never after a failure', async () => {
    const onDone = vi.fn();
    fake.send
      .mockRejectedValueOnce(new AtropyleError('USER_REJECTED', { details: { index: 0, completed: 0 } }))
      .mockResolvedValueOnce({ vault: V, steps: [] });
    setup({ plan: plan1, provider: null, onDone });
    await ready();
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-error');
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('offers Retry when the SDK chunk fails to load, and never says Preparing after the failure', async () => {
    fake.sdkFails.value = true;
    setup({ provider: null });
    const box = await screen.findByTestId('tx-error');
    expect(sendButton().textContent).toBe('Send');
    expect(sendButton().getAttribute('aria-busy')).toBeNull();
    fake.sdkFails.value = false;
    fireEvent.click(within(box).getByRole('button', { name: 'Retry' }));
    await ready();
  });

  it('gives focus to the receipt heading when the last step is confirmed', async () => {
    fake.send.mockResolvedValue({ vault: V, steps: [] });
    setup({ plan: plan1, provider: null });
    await ready();
    act(() => sendButton().focus());
    fireEvent.click(sendButton());
    const done = await screen.findByTestId('tx-done');
    await waitFor(() =>
      expect(document.activeElement).toBe(within(done).getByRole('heading', { name: 'Recorded on chain' })),
    );
  });
});
