import { modelEngine } from '@atropyle/sdk';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CHAIN_ID } from '../../src/chain/hooks';
import { chainKeys } from '../../src/chain/keys';
import type { Sdk } from '../../src/chain/types';
import { engineKey, usePolicyEngine } from '../../src/flows/time-machine/use-engine';
import { makeWrapper } from '../helpers/render';

const CPU = '0x3333333333333333333333333333333333333333';

function withSdk() {
  const engine = vi.fn(async () => modelEngine());
  const engineFor = vi.fn(async () => modelEngine());
  const w = makeWrapper();
  // The SDK query is already settled: the hook reads it from the cache and never builds a client.
  w.queryClient.setQueryData(chainKeys.sdk(CHAIN_ID, false), { atro: { engine, engineFor } } as unknown as Sdk);
  return { ...w, engine, engineFor };
}

describe('usePolicyEngine', () => {
  it("reads a binding's engine once, under a key made of its CPU and policy id", async () => {
    const { wrapper, queryClient, engineFor } = withSdk();
    const binding = { cpu: CPU, policyId: 1n } as const;
    const { result } = renderHook(() => usePolicyEngine(binding), { wrapper });
    await waitFor(() => expect(result.current.data?.kind).toBe('model'));
    expect(engineFor).toHaveBeenCalledWith(CPU, 1n);
    expect(engineKey(binding)).toBe(`${CPU}:1`);
    expect(queryClient.getQueryCache().find({ queryKey: chainKeys.engine(CHAIN_ID, `${CPU}:1`) })).toBeDefined();
    renderHook(() => usePolicyEngine({ cpu: CPU, policyId: 1n }), { wrapper });
    expect(engineFor).toHaveBeenCalledTimes(1);
  });

  it("reads the deployment's engine for a plan with no vault (null)", async () => {
    const { wrapper, engine } = withSdk();
    const { result } = renderHook(() => usePolicyEngine(null), { wrapper });
    await waitFor(() => expect(result.current.data?.kind).toBe('model'));
    expect(engine).toHaveBeenCalledTimes(1);
    expect(engineKey(null)).toBe('deployment');
  });

  it('reads nothing when disabled (an engine at hand)', () => {
    const { wrapper, engine } = withSdk();
    const { result } = renderHook(() => usePolicyEngine(null, { enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(engine).not.toHaveBeenCalled();
  });
});
