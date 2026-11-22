// @vitest-environment happy-dom
import { AtropyleError, type PreparedTx, planError, type TxPlan, type VaultAction } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ContextType } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionRunner } from '../../src/ui/action-runner';
import { AppContext } from '../../src/ui/app-context';
import { PEOPLE } from './fixtures';

afterEach(cleanup);

const step: PreparedTx = {
  chainId: 31337,
  from: PEOPLE.owner,
  to: PEOPLE.vault,
  data: '0x',
  value: 0n,
  action: 'checkIn',
  summary: 'Check in',
  warnings: [],
  simulation: { ok: true, gas: 50_000n },
};
const plan: TxPlan = {
  chainId: 31337,
  from: PEOPLE.owner,
  vault: PEOPLE.vault,
  steps: [step],
  summary: 'Plan',
  warnings: [],
};

type Send = (p: TxPlan, w: unknown, o: { onStep?: (e: unknown) => void }) => Promise<unknown>;

function setup(send: Send, prepareImpl: () => Promise<TxPlan> = async () => plan) {
  const prepare = vi.fn(prepareImpl);
  const sdk = {
    atro: {
      chain: { id: 31337 },
      vault: () => ({ prepare }),
      send,
      handoff: { link: () => 'https://example.test/#/sign?p=x' },
    },
    deployment: { explorerUrl: null },
  };
  const value = {
    lang: 'en',
    env: { docsPath: null },
    sdk,
    wallet: { account: PEOPLE.owner, chainId: 31337 },
    walletClient: () => ({}),
  } as unknown as NonNullable<ContextType<typeof AppContext>>;
  const ui = (
    action: VaultAction,
    onProgress?: (p: { confirmed: number; committed: boolean }) => void,
    onPlan?: (held: boolean) => void,
  ) => (
    <AppContext.Provider value={value}>
      <ActionRunner
        sdk={sdk as never}
        vault={PEOPLE.vault}
        action={action}
        as={PEOPLE.owner}
        label="Go"
        testid="act"
        onProgress={onProgress}
        onPlan={onPlan}
      />
    </AppContext.Provider>
  );
  return { prepare, ui };
}

const has = (id: string) => screen.queryByTestId(id) !== null;

describe('ActionRunner lock', () => {
  it('hides Start over while a send is committed and shows it again after a rejection with no hash', async () => {
    let reject: (e: unknown) => void = () => {};
    const send: Send = () =>
      new Promise((_, rej) => {
        reject = rej;
      });
    const { ui } = setup(send);
    render(ui({ type: 'checkIn' }));
    fireEvent.click(screen.getByTestId('act'));
    await screen.findByTestId('act-tx-send');
    expect(has('act-reset')).toBe(true);
    fireEvent.click(screen.getByTestId('act-tx-send'));
    await waitFor(() => expect(has('act-reset')).toBe(false));
    reject(new AtropyleError('USER_REJECTED'));
    await waitFor(() => expect(has('act-reset')).toBe(true));
  });

  it('keeps a committed plan when the action changes, and drops an uncommitted one', async () => {
    const send: Send = () => new Promise(() => {});
    const { prepare, ui } = setup(send);
    const view = render(ui({ type: 'checkIn' }));
    fireEvent.click(screen.getByTestId('act'));
    await screen.findByTestId('act-tx-send');
    view.rerender(ui({ type: 'revokeAll' }));
    await waitFor(() => expect(has('act')).toBe(true));
    expect(has('act-tx-send')).toBe(false);

    fireEvent.click(screen.getByTestId('act'));
    await screen.findByTestId('act-tx-send');
    fireEvent.click(screen.getByTestId('act-tx-send'));
    await waitFor(() => expect(has('act-reset')).toBe(false));
    view.rerender(ui({ type: 'checkIn' }));
    expect(has('act-tx-send')).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('reports progress and whether a plan is held', async () => {
    const send: Send = () => new Promise(() => {});
    const seen: boolean[] = [];
    const held: boolean[] = [];
    const { ui } = setup(send);
    render(
      ui(
        { type: 'checkIn' },
        (p) => seen.push(p.committed),
        (h) => held.push(h),
      ),
    );
    fireEvent.click(screen.getByTestId('act'));
    await screen.findByTestId('act-tx-send');
    fireEvent.click(screen.getByTestId('act-tx-send'));
    await waitFor(() => expect(seen).toContain(true));
    expect(held.at(-1)).toBe(true);
  });

  it('re-arms after a full success: Start over returns, onPlan(false) is reported, a second run can be prepared', async () => {
    const send: Send = async (p, _w, o) => {
      o.onStep?.({ index: 0, total: 1, step: p.steps[0], phase: 'confirmed', hash: `0x${'12'.repeat(32)}` });
      return { vault: PEOPLE.vault, steps: [] };
    };
    const held: boolean[] = [];
    const { prepare, ui } = setup(send);
    render(ui({ type: 'checkIn' }, undefined, (h) => held.push(h)));
    fireEvent.click(screen.getByTestId('act'));
    await screen.findByTestId('act-tx-send');
    fireEvent.click(screen.getByTestId('act-tx-send'));
    await screen.findByTestId('act-tx-done');
    await waitFor(() => expect(has('act-reset')).toBe(true));
    await waitFor(() => expect(held.at(-1)).toBe(false));
    fireEvent.click(screen.getByTestId('act-reset'));
    fireEvent.click(await screen.findByTestId('act'));
    await screen.findByTestId('act-tx-send');
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('keeps a finished plan on screen while its action is unchanged', async () => {
    const send: Send = async (p, _w, o) => {
      o.onStep?.({ index: 0, total: 1, step: p.steps[0], phase: 'confirmed', hash: `0x${'12'.repeat(32)}` });
      return { vault: PEOPLE.vault, steps: [] };
    };
    const { ui } = setup(send);
    const view = render(ui({ type: 'checkIn' }));
    fireEvent.click(screen.getByTestId('act'));
    fireEvent.click(await screen.findByTestId('act-tx-send'));
    await screen.findByTestId('act-tx-done');
    view.rerender(ui({ type: 'checkIn' }));
    expect(has('act-tx-done')).toBe(true);
    view.rerender(ui({ type: 'revokeAll' }));
    await waitFor(() => expect(has('act-tx-done')).toBe(false));
  });

  it('resets a plan kept across an action change once a hashless rejection unlocks it', async () => {
    let reject: (e: unknown) => void = () => {};
    const send: Send = () =>
      new Promise((_, rej) => {
        reject = rej;
      });
    const { ui } = setup(send);
    const view = render(ui({ type: 'checkIn' }));
    fireEvent.click(screen.getByTestId('act'));
    fireEvent.click(await screen.findByTestId('act-tx-send'));
    await waitFor(() => expect(has('act-reset')).toBe(false));
    view.rerender(ui({ type: 'revokeAll' }));
    expect(has('act-tx-send')).toBe(true);
    reject(new AtropyleError('USER_REJECTED'));
    await waitFor(() => expect(has('act-tx-send')).toBe(false));
    expect(has('act')).toBe(true);
  });

  it('drops a prepare result whose action changed meanwhile and reports held while preparing', async () => {
    let resolve: (p: TxPlan) => void = () => {};
    const held: boolean[] = [];
    const { ui } = setup(
      () => new Promise(() => {}),
      () =>
        new Promise<TxPlan>((r) => {
          resolve = r;
        }),
    );
    const view = render(ui({ type: 'checkIn' }, undefined, (h) => held.push(h)));
    fireEvent.click(screen.getByTestId('act'));
    await waitFor(() => expect(held.at(-1)).toBe(true));
    view.rerender(ui({ type: 'revokeAll' }, undefined, (h) => held.push(h)));
    // A stale plan would be rendered for a moment before the key effect removed it, so watch every mutation.
    let seen = false;
    const observer = new MutationObserver(() => {
      if (has('act-tx-send')) seen = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    resolve(plan);
    await waitFor(() => expect(held.at(-1)).toBe(false));
    await new Promise((r) => setTimeout(r, 20));
    observer.disconnect();
    expect(seen).toBe(false);
    expect(has('act-tx-send')).toBe(false);
    expect(has('act')).toBe(true);
  });

  it('clears a prepare error when the action changes', async () => {
    const issues = [{ path: 'heirs', code: 'SHARES_SUM' as const, message: 'heirs: shares must add up to 100' }];
    const { ui } = setup(
      () => new Promise(() => {}),
      async () => {
        throw planError(issues);
      },
    );
    const view = render(ui({ type: 'checkIn' }));
    fireEvent.click(screen.getByTestId('act'));
    await screen.findByTestId('act-issues');
    view.rerender(ui({ type: 'revokeAll' }));
    await waitFor(() => expect(has('act-issues')).toBe(false));
  });

  it('keeps a confirmed row when the send starts right after the runner mounted', async () => {
    const send: Send = (p, _w, o) => {
      o.onStep?.({ index: 0, total: 1, step: p.steps[0], phase: 'confirmed', hash: `0x${'12'.repeat(32)}` });
      return new Promise(() => {});
    };
    const { ui } = setup(send);
    render(ui({ type: 'checkIn' }));
    fireEvent.click(screen.getByTestId('act'));
    fireEvent.click(await screen.findByTestId('act-tx-send'));
    await waitFor(() => expect(has('act-reset')).toBe(false));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('act-tx-step-0').getAttribute('data-phase')).toBe('confirmed');
  });
});
