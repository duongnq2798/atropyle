import { onlineManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAIN_ID, useInvalidateVault } from '../../src/chain/hooks';
import { chainKeys } from '../../src/chain/keys';
import { useProof, useVaultVerify } from '../../src/verify/hooks';
import type { PolicyVerification, VaultVerification } from '../../src/verify/types';
import { makeWrapper } from '../helpers/render';
import { PEOPLE } from './fixtures';

const impl = vi.hoisted(() => ({ runProof: vi.fn(), runVaultVerify: vi.fn() }));
vi.mock('../../src/verify/load', () => ({ loadVerifyImpl: async () => impl }));
/** `failures` requests for the SDK chunk fail first, as a flaky connection or a redeploy makes them fail. */
const chunk = vi.hoisted(() => ({ failures: 0 }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: (deployment: unknown) => ({ deployment, atro: {}, rpc: { read: [], verify: [] } }),
  };
  return {
    loadChainImpl: async () => {
      if (chunk.failures > 0) {
        chunk.failures -= 1;
        throw new TypeError('Failed to fetch dynamically imported module');
      }
      return chain;
    },
    peekChainImpl: () => chain,
  };
});

type Progress = (done: number, total: number) => void;

beforeEach(() => {
  vi.resetAllMocks();
  chunk.failures = 0;
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

  it('keeps the count for a page that mounts while the proof runs', async () => {
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
    act(() => first.result.current.run());
    await waitFor(() => expect(first.result.current.progress).toEqual({ done: 1, total: 4 }));
    first.unmount();

    // The user went to a vault and back: the run goes on, and the page it comes back to shows the count.
    const back = renderHook(() => useProof(), { wrapper });
    expect(back.result.current.status).toBe('running');
    expect(back.result.current.progress).toEqual({ done: 1, total: 4 });

    act(() => finish({ ok: true } as unknown as PolicyVerification));
    await waitFor(() => expect(back.result.current.status).toBe('done'));
    expect(back.result.current.progress).toBeNull();
    expect(impl.runProof).toHaveBeenCalledTimes(1);
  });

  it('reports an SDK that failed to load, and Run loads it again', async () => {
    chunk.failures = 1;
    impl.runProof.mockResolvedValue({ ok: true });
    const { wrapper, queryClient } = makeWrapper();
    const h = renderHook(() => useProof(), { wrapper });
    // A page that never asks for the proof never loads the SDK for it.
    expect(queryClient.getQueryState(chainKeys.sdk(CHAIN_ID, false))).toBeUndefined();

    act(() => h.result.current.run());
    await waitFor(() => expect(h.result.current.status).toBe('error'));
    expect(h.result.current.error).toBeInstanceOf(TypeError);
    expect(impl.runProof).not.toHaveBeenCalled();

    act(() => h.result.current.run());
    await waitFor(() => expect(h.result.current.status).toBe('done'));
    expect(h.result.current.error).toBeNull();
    expect(impl.runProof).toHaveBeenCalledTimes(1);
  });

  it('shows no count while idle, although a vault page left the proof running', async () => {
    let finish: (r: VaultVerification) => void = () => undefined;
    impl.runVaultVerify.mockImplementation(
      (_sdk: unknown, _vault: string, o: { onProgress?: Progress }) =>
        new Promise<VaultVerification>((resolve) => {
          o.onProgress?.(1, 4);
          finish = resolve;
        }),
    );
    const { wrapper, queryClient } = makeWrapper();
    const vaultPage = renderHook(() => useVaultVerify(PEOPLE.vault as Address, true), { wrapper });
    await waitFor(() => expect(vaultPage.result.current.progress).toEqual({ done: 1, total: 4 }));
    vaultPage.unmount();

    const proofPage = renderHook(() => useProof(), { wrapper });
    expect(proofPage.result.current.status).toBe('idle');
    expect(proofPage.result.current.progress).toBeNull();

    act(() => finish({ ok: true } as unknown as VaultVerification));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
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

  it('reports an SDK that failed to load, and Retry loads it again', async () => {
    chunk.failures = 1;
    impl.runVaultVerify.mockImplementation(async (_sdk: unknown, vault: string) => ({ vault }));
    const { wrapper } = makeWrapper();
    const h = renderHook(() => useVaultVerify(PEOPLE.vault as Address, false), { wrapper });
    await waitFor(() => expect(h.result.current.status).toBe('error'));
    expect(h.result.current.error).toBeInstanceOf(TypeError);
    expect(impl.runVaultVerify).not.toHaveBeenCalled();

    act(() => h.result.current.retry());
    await waitFor(() => expect(h.result.current.status).toBe('done'));
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.result).toMatchObject({ vault: PEOPLE.vault });
  });

  it('has nothing to retry without a vault', async () => {
    const { wrapper, queryClient } = makeWrapper();
    const h = renderHook(() => useVaultVerify(null, false), { wrapper });
    act(() => h.result.current.retry());
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(h.result.current.status).toBe('idle');
    expect(h.result.current.error).toBeNull();
    expect(impl.runVaultVerify).not.toHaveBeenCalled();
  });

  it('checks the vault again after a transaction on it', async () => {
    impl.runVaultVerify.mockImplementation(async (_sdk: unknown, vault: string) => ({ vault }));
    const { wrapper } = makeWrapper();
    const h = renderHook(
      () => ({ verify: useVaultVerify(PEOPLE.vault as Address, false), invalidate: useInvalidateVault() }),
      { wrapper },
    );
    await waitFor(() => expect(h.result.current.verify.status).toBe('done'));
    await act(() => h.result.current.invalidate(PEOPLE.vault));
    expect(impl.runVaultVerify).toHaveBeenCalledTimes(2);
  });
});

describe('while the browser says it is offline', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('runs the proof, so a failed read shows as an error with its Retry, not as a run', async () => {
    onlineManager.setOnline(false);
    impl.runProof.mockRejectedValueOnce(Object.assign(new Error('every RPC failed'), { code: 'RPC_UNAVAILABLE' }));
    const { wrapper } = makeWrapper();
    const h = renderHook(() => useProof(), { wrapper });
    act(() => h.result.current.run());
    await waitFor(() => expect(h.result.current.status).toBe('error'));
    expect(h.result.current.error).toMatchObject({ code: 'RPC_UNAVAILABLE' });
  });

  it('checks a vault with the SDK it already has', async () => {
    onlineManager.setOnline(false);
    impl.runVaultVerify.mockImplementation(async (_sdk: unknown, vault: string) => ({ vault }));
    const { wrapper } = makeWrapper();
    const h = renderHook(() => useVaultVerify(PEOPLE.vault as Address, false), { wrapper });
    await waitFor(() => expect(h.result.current.status).toBe('done'));
    expect(h.result.current.result).toMatchObject({ vault: PEOPLE.vault });
  });
});
