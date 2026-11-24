import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import { useApiStats, useConfirm, useHealth, useMe, useSubscribe, useUnsubscribe } from '../../src/api/hooks';
import type { SubscribeRequest } from '../../src/api/types';
import { toCache } from '../../src/chain/impl/stats-view';
import { freshest, type StatsSummary, summaryOfApi, useStats } from '../../src/chain/use-stats';
import { makeWrapper } from '../helpers/render';
import { fixtureDeployment, fixtureStats, PEOPLE } from './fixtures';

const fake = vi.hoisted(() => ({
  subscribe: vi.fn(),
  confirm: vi.fn(),
  unsubscribe: vi.fn(),
  me: vi.fn(),
  stats: vi.fn(),
  health: vi.fn(),
}));
const backend = vi.hoisted(() => ({ on: true }));
vi.mock('../../src/api/instance', () => ({ getApi: () => (backend.on ? fake : null) }));

const impl = vi.hoisted(() => ({
  loadDeployment: vi.fn(),
  createSdk: vi.fn(),
  cachedStats: vi.fn(),
  countStats: vi.fn(),
}));
vi.mock('../../src/chain/load', () => ({ loadChainImpl: async () => impl, peekChainImpl: () => impl }));

const STATS = { block: '2500', vaults: '7', drills: '2', checkIns: '40', updatedAt: '2026-11-23T08:00:00.000Z' };
const REQUEST: SubscribeRequest = {
  email: 'ana@example.com',
  vault: PEOPLE.vault,
  role: 'heir',
  lang: 'vi',
  website: '',
};
const HEALTH = {
  indexer: { block: '1234', lagBlocks: 2, updatedAt: '2026-11-23T08:00:00.000Z' },
  integrity: null,
  keeper: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  backend.on = true;
  impl.loadDeployment.mockImplementation(() => fixtureDeployment());
  impl.createSdk.mockImplementation(() => ({ fake: 'sdk' }));
  impl.cachedStats.mockReturnValue(null);
});

describe('stats summary', () => {
  const at = (source: 'api' | 'chain', block: bigint): StatsSummary => ({
    source,
    block,
    vaults: 1,
    drills: 0,
    checkIns: 0,
    savedAtMs: null,
  });

  it('takes the count at the higher block, and the count of this device on a tie', () => {
    expect(freshest(null, null)).toBeNull();
    expect(freshest(at('api', 5n), null)?.source).toBe('api');
    expect(freshest(null, at('chain', 5n))?.source).toBe('chain');
    expect(freshest(at('api', 6n), at('chain', 5n))?.source).toBe('api');
    expect(freshest(at('api', 5n), at('chain', 6n))?.source).toBe('chain');
    expect(freshest(at('api', 5n), at('chain', 5n))?.source).toBe('chain');
    expect(freshest(at('chain', 5n), at('api', 5n))?.source).toBe('chain');
  });

  it('reads the decimal strings of the backend', () => {
    expect(summaryOfApi(STATS)).toEqual({
      source: 'api',
      block: 2_500n,
      vaults: 7,
      drills: 2,
      checkIns: 40,
      savedAtMs: null,
    });
  });
});

describe('useStats with a backend', () => {
  it('shows the backend count without counting on the chain', async () => {
    fake.stats.mockResolvedValue(STATS);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.summary).toMatchObject({ source: 'api', block: 2_500n, vaults: 7 }));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(impl.countStats).not.toHaveBeenCalled();
  });

  it('falls back to the chain when the backend fails, and reports the failure only while nothing shows', async () => {
    fake.stats.mockRejectedValue(new ApiError('INTERNAL', 503, 'GET /stats: HTTP 503'));
    impl.countStats.mockResolvedValue(toCache(fixtureStats(), 6));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'INTERNAL' }));
    expect(result.current.summary).toBeNull();
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(impl.cachedStats).toHaveBeenCalled());
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.summary).toMatchObject({ source: 'chain', block: 2_000n, vaults: 3 }));
    expect(result.current.error).toBeNull();
  });

  it('asks nothing on a build without a backend', async () => {
    backend.on = false;
    impl.cachedStats.mockReturnValue(toCache(fixtureStats(), 5));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.summary).toMatchObject({ source: 'chain', checkIns: 5 }));
    expect(fake.stats).not.toHaveBeenCalled();
  });
});

describe('backend hooks', () => {
  it('asks for the vaults of an account only once there is a valid one', async () => {
    fake.me.mockResolvedValue({ address: PEOPLE.owner, block: '10', vaults: [] });
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(({ a }: { a: string | null }) => useMe(a), {
      wrapper,
      initialProps: { a: null as string | null },
    });
    expect(result.current.fetchStatus).toBe('idle');
    rerender({ a: 'not an address' });
    expect(result.current.fetchStatus).toBe('idle');
    rerender({ a: PEOPLE.owner });
    await waitFor(() => expect(result.current.data?.address).toBe(PEOPLE.owner));
    expect(fake.me).toHaveBeenCalledTimes(1);
    expect(fake.me.mock.calls[0][0]).toBe(PEOPLE.owner);
  });

  it('reads the health of the backend', async () => {
    fake.health.mockResolvedValue(HEALTH);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useHealth(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(HEALTH));
  });

  it('sends a subscription, a confirmation and an unsubscription as given', async () => {
    fake.subscribe.mockResolvedValue({ ok: true });
    fake.confirm.mockResolvedValue({ ok: true, vault: PEOPLE.vault, role: 'heir' });
    fake.unsubscribe.mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({ s: useSubscribe(), c: useConfirm(), u: useUnsubscribe() }), { wrapper });
    await act(async () => {
      await result.current.s.mutateAsync(REQUEST);
      await result.current.c.mutateAsync('tok-1');
      await result.current.u.mutateAsync('tok-2');
    });
    expect(fake.subscribe).toHaveBeenCalledWith(REQUEST);
    expect(fake.confirm).toHaveBeenCalledWith('tok-1');
    expect(fake.unsubscribe).toHaveBeenCalledWith('tok-2');
    await waitFor(() => expect(result.current.c.data).toEqual({ ok: true, vault: PEOPLE.vault, role: 'heir' }));
  });

  it('stays idle without a backend, and a form fails as unavailable', async () => {
    backend.on = false;
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({ stats: useApiStats(), health: useHealth(), subscribe: useSubscribe() }), {
      wrapper,
    });
    expect(result.current.stats.fetchStatus).toBe('idle');
    expect(result.current.health.fetchStatus).toBe('idle');
    await act(async () => {
      await expect(result.current.subscribe.mutateAsync(REQUEST)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });
    expect(fake.subscribe).not.toHaveBeenCalled();
    expect(fake.stats).not.toHaveBeenCalled();
  });
});
