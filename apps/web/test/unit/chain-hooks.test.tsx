import { act, renderHook, waitFor } from '@testing-library/react';
import type { Address } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSdk, useVault } from '../../src/chain/hooks';
import { toCache } from '../../src/chain/impl/stats-view';
import { useChainSettings } from '../../src/chain/provider';
import type { LoadedVault } from '../../src/chain/types';
import { useStats } from '../../src/chain/use-stats';
import { KEYS } from '../../src/lib/store';
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
vi.mock('../../src/chain/load', () => ({ loadChainImpl: async () => impl }));

const A = PEOPLE.vault as Address;
const B = PEOPLE.stranger as Address;
const loaded = (vault: string) =>
  ({ snap: { status: { vault } }, timeline: null, registered: true, fetchedAtMs: 0 }) as unknown as LoadedVault;

beforeEach(() => {
  vi.resetAllMocks();
  impl.loadDeployment.mockImplementation(() => fixtureDeployment());
  impl.createSdk.mockImplementation((deployment: unknown, target: string, crossCheck: boolean) => ({
    deployment,
    target,
    crossCheck,
  }));
  impl.loadVault.mockImplementation(async (_sdk: unknown, vault: string) => loaded(vault));
  impl.cachedStats.mockReturnValue(null);
});

describe('useSdk', () => {
  it('builds one SDK per cross-check setting and remembers the setting', async () => {
    const { wrapper, kv } = makeWrapper();
    const { result } = renderHook(() => ({ sdk: useSdk(), settings: useChainSettings() }), { wrapper });
    await waitFor(() => expect(result.current.sdk.data).toMatchObject({ target: 'deweb', crossCheck: false }));
    act(() => result.current.settings.setCrossCheck(true));
    await waitFor(() => expect(result.current.sdk.data).toMatchObject({ crossCheck: true }));
    expect(kv.get(KEYS.crossCheck)).toBe('1');
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
});
