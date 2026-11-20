// @vitest-environment happy-dom
import { AtropyleError, type PreparedTx, type TxPlan, type VaultAction } from '@atropyle/sdk';
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

function setup(send: Send) {
  const prepare = vi.fn(async () => plan);
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
  const ui = (action: VaultAction, onProgress?: (p: { confirmed: number; committed: boolean }) => void) => (
    <AppContext.Provider value={value}>
      <ActionRunner
        sdk={sdk as never}
        vault={PEOPLE.vault}
        action={action}
        as={PEOPLE.owner}
        label="Go"
        testid="act"
        onProgress={onProgress}
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
    const { ui } = setup(send);
    render(ui({ type: 'checkIn' }, (p) => seen.push(p.committed)));
    fireEvent.click(screen.getByTestId('act'));
    await screen.findByTestId('act-tx-send');
    fireEvent.click(screen.getByTestId('act-tx-send'));
    await waitFor(() => expect(seen).toContain(true));
  });
});
