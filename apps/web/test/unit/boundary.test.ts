import { act, renderHook } from '@testing-library/react';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextBoundary, refetchDelay, vaultRefetchMs } from '../../src/app/vault/boundary';
import { makeQueryClient } from '../../src/chain/query-client';
import type { LoadedVault } from '../../src/chain/types';
import { useVault } from '../../src/chain/use-vault';
import { makeWrapper } from '../helpers/render';
import { fixtureDeployment, PEOPLE } from './fixtures';

const impl = vi.hoisted(() => ({ loadDeployment: vi.fn(), createSdk: vi.fn(), loadVault: vi.fn() }));
vi.mock('../../src/chain/load', () => ({ loadChainImpl: async () => impl }));

const A = PEOPLE.vault as Address;
const NONE = { alarmAt: null, windowEndsAt: null, expiresAt: null };
const chain = { block: 1_000n };
const loadedAt = (blockTimestamp: bigint, lateAt: bigint, fetchedAtMs: number) =>
  ({
    snap: { status: { blockTimestamp, lateAt, ...NONE, releasedAt: null, expired: false } },
    timeline: null,
    registered: true,
    fetchedAtMs,
  }) as unknown as LoadedVault;

beforeEach(() => {
  vi.resetAllMocks();
  chain.block = 1_000n;
  impl.loadDeployment.mockImplementation(() => fixtureDeployment());
  impl.createSdk.mockImplementation(() => ({}));
  impl.loadVault.mockImplementation(async () => loadedAt(chain.block, 1_010n, Date.now()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('nextBoundary', () => {
  it('is the nearest moment after now among lateAt, alarmAt, windowEndsAt, expiresAt and any more', () => {
    expect(nextBoundary({ lateAt: 1_050n, alarmAt: 900n, windowEndsAt: 1_200n, expiresAt: 5_000n }, 1_000n)).toBe(
      1_050n,
    );
    expect(nextBoundary({ lateAt: 990n, ...NONE }, 1_000n)).toBeNull();
    expect(nextBoundary({ lateAt: 990n, ...NONE }, 1_000n, [1_500n, null])).toBe(1_500n);
    // A moment that is now has passed: the block that carries it already exists.
    expect(nextBoundary({ lateAt: 1_000n, ...NONE }, 1_000n)).toBeNull();
  });
});

describe('refetchDelay', () => {
  it('reads 1.5 s after the boundary, never sooner than 1 s, never later than the normal pace', () => {
    expect(refetchDelay(1_010n, 1_000n)).toBe(11_500);
    expect(refetchDelay(999n, 1_000n)).toBe(1_000);
    expect(refetchDelay(10_000n, 1_000n)).toBe(30_000);
    expect(refetchDelay(null, 1_000n)).toBe(30_000);
  });

  it('counts from chain time: the block of the read plus the wall clock since it', () => {
    expect(vaultRefetchMs(loadedAt(1_000n, 1_010n, 0), 4_000)).toBe(7_500);
    expect(vaultRefetchMs(loadedAt(1_000n, 990n, 0), 4_000)).toBe(30_000);
  });
});

describe('useVault with vaultRefetchMs', () => {
  it('reads again 1.5 s after the next boundary instead of at the 30 s pace, then goes back to it', async () => {
    vi.useFakeTimers();
    const { wrapper } = makeWrapper({ queryClient: makeQueryClient() });
    renderHook(() => useVault(A, { refetchMs: vaultRefetchMs }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(impl.loadVault).toHaveBeenCalledTimes(1);
    chain.block = 1_012n;
    await act(() => vi.advanceTimersByTimeAsync(11_000));
    expect(impl.loadVault).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(impl.loadVault).toHaveBeenCalledTimes(2);
    // Past lateAt nothing is due any more: the normal pace again.
    await act(() => vi.advanceTimersByTimeAsync(29_000));
    expect(impl.loadVault).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(impl.loadVault).toHaveBeenCalledTimes(3);
  });
});
