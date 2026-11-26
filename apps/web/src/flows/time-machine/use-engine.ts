'use client';

import type { PolicyEngine } from '@atropyle/sdk';
import { type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address } from 'viem';
import { CHAIN_ID, sdkQuery } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
import { useChainSettings } from '@/chain/provider';

/** Where a vault's rules run: its CPU and policy id (VaultSnapshot.binding). */
export interface EngineBinding {
  cpu: Address;
  policyId: bigint;
}

/** The engine's cache key: one per CPU and policy, whatever object the caller passes. */
export function engineKey(binding: EngineBinding | null): string {
  return binding ? `${binding.cpu.toLowerCase()}:${binding.policyId.toString()}` : 'deployment';
}

/**
 * The policy engine of a vault's binding (its CPU's netlist read from chain, or the reference model where the CPU
 * has none, like the devnet's), or of the deployment for a plan with no vault yet (`null`). One read per binding
 * for the session; a failed read is the query's error, for the page's Retry. The SDK comes from its own query's
 * cache (sdkQuery), so `enabled: false` (a caller with an engine at hand) loads nothing. The cross-check setting
 * is not in the key: whichever RPC reads it, the netlist is the same.
 */
export function usePolicyEngine(
  binding: EngineBinding | null,
  o: { enabled?: boolean } = {},
): UseQueryResult<PolicyEngine> {
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  const cpu = binding?.cpu ?? null;
  const policyId = binding?.policyId ?? null;
  return useQuery({
    queryKey: chainKeys.engine(CHAIN_ID, engineKey(binding)),
    queryFn: async (): Promise<PolicyEngine> => {
      const { atro } = await client.query({ ...sdkQuery(crossCheck), retry: false });
      return cpu !== null && policyId !== null ? atro.engineFor(cpu, policyId) : atro.engine();
    },
    enabled: o.enabled ?? true,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    structuralSharing: false,
  });
}
