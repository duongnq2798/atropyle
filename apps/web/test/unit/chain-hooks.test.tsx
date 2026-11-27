import { focusManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvalidateVault, useVaultsOf } from '../../src/chain/hooks';
import { toCache } from '../../src/chain/impl/stats-view';
import { useChainSettings } from '../../src/chain/provider';
import { makeQueryClient } from '../../src/chain/query-client';
import type { CachedStats, LoadedVault } from '../../src/chain/types';
import { useSdk } from '../../src/chain/use-sdk';
import { useStats } from '../../src/chain/use-stats';
import { useVault } from '../../src/chain/use-vault';
import { KEYS, memoryKV } from '../../src/lib/store';
import { makeWrapper } from '../helpers/render';
import { fixtureDeployment, fixtureStats, PEOPLE } from './fixtures';

const impl = vi.hoisted(() => ({
  loadDeployment: vi.fn(),
  createSdk: vi.fn(),
  loadVault: vi.fn(),
  vaultsOf: vi.fn(),
  cachedStats: vi.fn(),
  countStats: vi.fn(),
}));
/** `failures` requests for the chunk fail first, as a flaky connection or a redeploy makes them fail. */
const chunk = vi.hoisted(() => ({ failures: 0 }));
vi.mock('../../src/chain/load', () => ({
  loadChainImpl: async () => {
    if (chunk.failures > 0) {
      chunk.failures -= 1;
      throw new TypeError('Failed to fetch dynamically imported module');
    }
    return impl;
  },
}));

const A = PEOPLE.vault as Address;
const B = PEOPLE.stranger as Address;
const OWNER = PEOPLE.owner as Address;
const loaded = (vault: string) =>
  ({ snap: { status: { vault } }, timeline: null, registered: true, fetchedAtMs: 0 }) as unknown as LoadedVault;
const fail = (code: string) => Object.assign(new Error(code), { code });
const readsOf = (vault: string) => impl.loadVault.mock.calls.filter(([, v]) => v === vault).length;

beforeEach(() => {
  vi.resetAllMocks();
  chunk.failures = 0;
  impl.loadDeployment.mockImplementation(() => fixtureDeployment());
  impl.createSdk.mockImplementation((deployment: unknown, target: string, crossCheck: boolean) => ({
    deployment,
    target,
    crossCheck,
  }));
  impl.loadVault.mockImplementation(async (_sdk: unknown, vault: string) => loaded(vault));
  impl.cachedStats.mockReturnValue(null);
});

afterEach(() => {
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe('useSdk', () => {
  it('builds one SDK per cross-check setting and remembers the setting', async () => {
    const { wrapper, kv } = makeWrapper();
    const { result } = renderHook(() => ({ sdk: useSdk(), settings: useChainSettings() }), { wrapper });
    await waitFor(() => expect(result.current.sdk.data).toMatchObject({ target: 'deweb', crossCheck: false }));
    act(() => result.current.settings.setCrossCheck(true));
    await waitFor(() => expect(result.current.sdk.data).toMatchObject({ crossCheck: true }));
    expect(kv.get(KEYS.crossCheck)).toBe('1');
    act(() => result.current.settings.setCrossCheck(false));
    await waitFor(() => expect(result.current.sdk.data).toMatchObject({ crossCheck: false }));
    expect(impl.createSdk).toHaveBeenCalledTimes(2);
  });

  it('reads the stored cross-check setting back', async () => {
    const kv = memoryKV();
    kv.set(KEYS.crossCheck, '1');
    const { wrapper } = makeWrapper({ kv });
    const { result } = renderHook(() => ({ sdk: useSdk(), settings: useChainSettings() }), { wrapper });
    await waitFor(() => expect(result.current.settings.crossCheck).toBe(true));
    await waitFor(() => expect(result.current.sdk.data).toMatchObject({ crossCheck: true }));
  });

  it('reports a broken deployment as an error, not a crash', async () => {
    impl.loadDeployment.mockImplementation(() => {
      throw Object.assign(new Error('NEXT_PUBLIC_DEPLOYMENT is not valid JSON.'), { code: 'DEPLOYMENT_INVALID' });
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSdk(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'DEPLOYMENT_INVALID' });
  });

  it('tries a chunk that failed to load again by itself', async () => {
    vi.useFakeTimers();
    chunk.failures = 1;
    const { wrapper } = makeWrapper({ queryClient: makeQueryClient() });
    const { result } = renderHook(() => useSdk(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(result.current.data).toMatchObject({ target: 'deweb' });
  });
});

describe('useVault', () => {
  it('waits for an address', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({ sdk: useSdk(), vault: useVault(null) }), { wrapper });
    await waitFor(() => expect(result.current.sdk.isSuccess).toBe(true));
    expect(result.current.vault.fetchStatus).toBe('idle');
    expect(impl.loadVault).not.toHaveBeenCalled();
  });

  it('never shows the previous vault while the next one loads', async () => {
    let release: (() => void) | undefined;
    impl.loadVault.mockImplementation(async (_sdk: unknown, vault: string) => {
      if (vault === B) await new Promise<void>((r) => (release = r));
      return loaded(vault);
    });
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(({ v }: { v: Address }) => useVault(v), {
      wrapper,
      initialProps: { v: A },
    });
    await waitFor(() => expect(result.current.data?.snap.status.vault).toBe(A));
    rerender({ v: B });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(release).toBeTypeOf('function'));
    act(() => release?.());
    await waitFor(() => expect(result.current.data?.snap.status.vault).toBe(B));
  });

  it('reports a broken deployment as an error, at once', async () => {
    impl.loadDeployment.mockImplementation(() => {
      throw Object.assign(new Error('NEXT_PUBLIC_DEPLOYMENT is not valid JSON.'), { code: 'DEPLOYMENT_INVALID' });
    });
    const { wrapper } = makeWrapper({ queryClient: makeQueryClient() });
    const { result } = renderHook(() => ({ vault: useVault(A), mine: useVaultsOf(OWNER) }), { wrapper });
    await waitFor(() => expect(result.current.vault.isError).toBe(true));
    await waitFor(() => expect(result.current.mine.isError).toBe(true));
    expect(result.current.vault.error).toMatchObject({ code: 'DEPLOYMENT_INVALID' });
    expect(result.current.mine.error).toMatchObject({ code: 'DEPLOYMENT_INVALID' });
    expect(impl.loadVault).not.toHaveBeenCalled();
    expect(impl.vaultsOf).not.toHaveBeenCalled();
  });

  it('reports a chunk that failed to load, and Retry reads the vault', async () => {
    chunk.failures = 1;
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useVault(A), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(TypeError);
    act(() => void result.current.refetch());
    await waitFor(() => expect(result.current.data?.snap.status.vault).toBe(A));
    expect(result.current.error).toBeNull();
  });

  it('reads a vault again after a transaction', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({ vault: useVault(A), invalidate: useInvalidateVault() }), { wrapper });
    await waitFor(() => expect(result.current.vault.isSuccess).toBe(true));
    await act(() => result.current.invalidate(A.toLowerCase()));
    expect(readsOf(A)).toBe(2);
  });
});

describe('a read that failed before it had data', () => {
  /** B is not a vault and OWNER's index read is refused; each answer takes 2 s, so a re-read shows as loading. */
  function failingReads() {
    impl.loadVault.mockImplementation(async (_sdk: unknown, vault: string) => {
      if (vault !== B) return loaded(vault);
      await new Promise((r) => setTimeout(r, 2_000));
      throw fail('NOT_VAULT');
    });
    impl.vaultsOf.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 2_000));
      throw fail('INVALID_ADDRESS');
    });
  }

  it('waits for Retry instead of polling, while a loaded vault keeps polling', async () => {
    vi.useFakeTimers();
    failingReads();
    const { wrapper } = makeWrapper({ queryClient: makeQueryClient() });
    const { result } = renderHook(() => ({ good: useVault(A), bad: useVault(B), mine: useVaultsOf(OWNER) }), {
      wrapper,
    });
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(result.current.bad.error).toMatchObject({ code: 'NOT_VAULT' });
    expect(result.current.mine.error).toMatchObject({ code: 'INVALID_ADDRESS' });
    const seen = new Set<string>();
    for (let s = 0; s < 70; s++) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      seen.add(`${result.current.bad.status} ${result.current.mine.status}`);
    }
    expect([...seen]).toEqual(['error error']);
    expect(readsOf(B)).toBe(1);
    expect(impl.vaultsOf).toHaveBeenCalledTimes(1);
    expect(readsOf(A)).toBe(3);
  });

  it('does not read again when the tab comes back, and reads on Retry', async () => {
    vi.useFakeTimers();
    failingReads();
    const { wrapper } = makeWrapper({ queryClient: makeQueryClient() });
    const { result } = renderHook(() => ({ bad: useVault(B), mine: useVaultsOf(OWNER) }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(result.current.bad.status).toBe('error');
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.bad.status).toBe('error');
    expect(result.current.mine.status).toBe('error');
    expect(readsOf(B)).toBe(1);
    expect(impl.vaultsOf).toHaveBeenCalledTimes(1);
    await act(async () => {
      void result.current.bad.refetch();
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(readsOf(B)).toBe(2);
    expect(result.current.bad.error).toMatchObject({ code: 'NOT_VAULT' });
  });
});

describe('useStats on the chain', () => {
  it('shows this device count at once and counts again on demand', async () => {
    impl.cachedStats.mockReturnValue(toCache(fixtureStats(), 5));
    impl.countStats.mockImplementation(
      async (_s: unknown, _kv: unknown, onProgress: (d: number, t: number) => void) => {
        onProgress(1, 4);
        return toCache({ ...fixtureStats(), checkIns: 9, toBlock: 2_100n }, 6);
      },
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.summary).toMatchObject({ source: 'chain', vaults: 3, checkIns: 5 }));
    expect(result.current.summary?.block).toBe(2_000n);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.summary).toMatchObject({ checkIns: 9, block: 2_100n, savedAtMs: 6 }));
    expect(result.current.progress).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('keeps the old count and reports the error when counting fails', async () => {
    impl.cachedStats.mockReturnValue(toCache(fixtureStats(), 5));
    impl.countStats.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'RPC_UNAVAILABLE' }));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'RPC_UNAVAILABLE' }));
    expect(result.current.summary?.checkIns).toBe(5);
  });

  it('reports an SDK that failed to load, and counting loads it again', async () => {
    chunk.failures = 1;
    let saved: CachedStats | null = null;
    impl.cachedStats.mockImplementation(() => saved);
    impl.countStats.mockImplementation(async () => {
      saved = toCache({ ...fixtureStats(), checkIns: 9 }, 6);
      return saved;
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(TypeError));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.summary).toMatchObject({ checkIns: 9, savedAtMs: 6 }));
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('counts once when the button is pressed again during a count', async () => {
    let finish: (() => void) | undefined;
    impl.countStats.mockImplementation(async () => {
      await new Promise<void>((r) => (finish = r));
      return toCache(fixtureStats(), 6);
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({ stats: useStats(), sdk: useSdk() }), { wrapper });
    await waitFor(() => expect(result.current.sdk.isSuccess).toBe(true));
    act(() => {
      result.current.stats.refresh();
      result.current.stats.refresh();
    });
    await waitFor(() => expect(result.current.stats.busy).toBe(true));
    act(() => result.current.stats.refresh());
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(impl.countStats).toHaveBeenCalledTimes(1);
    act(() => finish?.());
    await waitFor(() => expect(result.current.stats.busy).toBe(false));
    act(() => result.current.stats.refresh());
    await waitFor(() => expect(impl.countStats).toHaveBeenCalledTimes(2));
  });
});
