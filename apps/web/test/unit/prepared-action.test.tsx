import type { PreparedTx, TxPlan, VaultAction } from '@atropyle/sdk';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePreparedAction } from '../../src/app/vault/use-prepared-action';
import type { Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import { PEOPLE } from './fixtures';

const CHECK_IN: VaultAction = { type: 'checkIn' };
const REVOKE: VaultAction = { type: 'revokeAll' };
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
const planOf = (summary: string): TxPlan => ({
  chainId: 31337,
  from: PEOPLE.owner,
  vault: PEOPLE.vault,
  steps: [step],
  summary,
  warnings: [],
});
const sdkWith = (prepare: () => Promise<TxPlan>) => ({ atro: { vault: () => ({ prepare }) } }) as unknown as Sdk;

function setup(prepare: () => Promise<TxPlan>, auto = false) {
  const sdk = sdkWith(prepare);
  return renderHook(
    ({ action }: { action: VaultAction }) =>
      usePreparedAction({ sdk, flows, vault: PEOPLE.vault, action, as: PEOPLE.owner, auto }),
    { initialProps: { action: CHECK_IN } },
  );
}

describe('usePreparedAction', () => {
  it('keeps a committed plan when the action changes, and drops an uncommitted one', async () => {
    const plan = planOf('Plan');
    const { result, rerender } = setup(async () => plan);
    act(() => result.current.prepare());
    await waitFor(() => expect(result.current.plan).toBe(plan));
    rerender({ action: REVOKE });
    await waitFor(() => expect(result.current.plan).toBeNull());

    act(() => result.current.prepare());
    await waitFor(() => expect(result.current.plan).toBe(plan));
    act(() => result.current.report({ committed: true, finished: false }));
    rerender({ action: CHECK_IN });
    expect(result.current.plan).toBe(plan);
    expect(result.current.locked).toBe(true);
    // A rejection before any hash opens the lock: the plan for the old action goes.
    act(() => result.current.report({ committed: false, finished: false }));
    await waitFor(() => expect(result.current.plan).toBeNull());
  });

  it('auto prepares once per action and never shows a plan for an older action', async () => {
    const resolvers: ((p: TxPlan) => void)[] = [];
    const prepare = vi.fn(() => new Promise<TxPlan>((r) => resolvers.push(r)));
    const { result, rerender } = setup(prepare, true);
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    rerender({ action: REVOKE });
    act(() => resolvers[0](planOf('Old')));
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    expect(result.current.plan).toBeNull();
    const fresh = planOf('New');
    act(() => resolvers[1](fresh));
    await waitFor(() => expect(result.current.plan).toBe(fresh));
    rerender({ action: REVOKE });
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
