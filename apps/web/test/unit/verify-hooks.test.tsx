import { act, renderHook, waitFor } from '@testing-library/react';
import type { Address } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProof, useVaultVerify } from '../../src/verify/hooks';
import type { PolicyVerification } from '../../src/verify/types';
import { makeWrapper } from '../helpers/render';
import { PEOPLE } from './fixtures';

const impl = vi.hoisted(() => ({ runProof: vi.fn(), runVaultVerify: vi.fn() }));
vi.mock('../../src/verify/load', () => ({ loadVerifyImpl: async () => impl }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: (deployment: unknown) => ({ deployment, atro: {}, rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});

type Progress = (done: number, total: number) => void;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useProof', () => {
  it('runs only when asked, shows progress and keeps the result for the session', async () => {
    let finish: (r: PolicyVerification) => void = () => undefined;
    impl.runProof.mockImplementation(
      (_sdk: unknown, o: { onProgress?: Progress }) =>
        new Promise<PolicyVerification>((resolve) => {
          o.onProgress?.(1, 4);
          finish = resolve;
        }),
    );
    const { wrapper } = makeWrapper();
    const first = renderHook(() => useProof(), { wrapper });
    expect(first.result.current.status).toBe('idle');
    expect(impl.runProof).not.toHaveBeenCalled();

    act(() => first.result.current.run());
    expect(first.result.current.status).toBe('running');
    await waitFor(() => expect(first.result.current.progress).toEqual({ done: 1, total: 4 }));

    const result = { ok: true } as unknown as PolicyVerification;
    act(() => finish(result));
    await waitFor(() => expect(first.result.current.status).toBe('done'));
    expect(first.result.current.result).toBe(result);
    expect(first.result.current.progress).toBeNull();
    first.unmount();

    // Another page of the same session: the proof is not run again.
    const again = renderHook(() => useProof(), { wrapper });
    expect(again.result.current.status).toBe('done');
    expect(again.result.current.result).toBe(result);
    expect(impl.runProof).toHaveBeenCalledTimes(1);
  });

  it('reports a failed proof and runs it again on request', async () => {
    impl.runProof
      .mockRejectedValueOnce(Object.assign(new Error('every RPC failed'), { code: 'RPC_UNAVAILABLE' }))
      .mockResolvedValueOnce({ ok: true });
    const { wrapper } = makeWrapper();
    const h = renderHook(() => useProof(), { wrapper });
    act(() => h.result.current.run());
    await waitFor(() => expect(h.result.current.status).toBe('error'));
    expect(h.result.current.error).toMatchObject({ code: 'RPC_UNAVAILABLE' });

    act(() => h.result.current.run());
    await waitFor(() => expect(h.result.current.status).toBe('done'));
    expect(impl.runProof).toHaveBeenCalledTimes(2);
  });
});

describe('useVaultVerify', () => {
  it('checks the vault at once, and the policy only when asked', async () => {
    impl.runVaultVerify.mockImplementation(async (_sdk: unknown, vault: string, o: { policy: boolean }) => ({
      vault,
      policy: o.policy,
    }));
    const { wrapper } = makeWrapper();
    const h = renderHook(({ policy }) => useVaultVerify(PEOPLE.vault as Address, policy), {
      wrapper,
      initialProps: { policy: false },
    });
    expect(h.result.current.status).toBe('running');
    await waitFor(() => expect(h.result.current.status).toBe('done'));
    expect(h.result.current.result).toMatchObject({ vault: PEOPLE.vault, policy: false });

    h.rerender({ policy: true });
    await waitFor(() => expect(h.result.current.result).toMatchObject({ policy: true }));
    expect(impl.runVaultVerify).toHaveBeenCalledTimes(2);

    const none = renderHook(() => useVaultVerify(null, false), { wrapper });
    expect(none.result.current.status).toBe('idle');
  });
});
