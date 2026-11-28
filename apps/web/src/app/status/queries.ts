'use client';

import type { ChainCounters, IntegrityReport } from '@atropyle/sdk';
import { skipToken, type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { CHAIN_ID } from '@/chain/hooks';
import { loadChainImpl } from '@/chain/load';
import { useChainSettings } from '@/chain/provider';
import { useSdk } from '@/chain/use-sdk';
import { useKV } from '@/lib/kv';
import type * as Diag from './impl/diagnostics';
import type { RpcProbe } from './impl/diagnostics';

/** The counters read at most this many vaults, the team's index first (the SDK's own default). */
export const STATUS_MAX_VAULTS = 200;

/**
 * This page's reads, per RPC plan (ruling T10-R4): local keys under 'status', apart from chainKeys, so no other task's
 * edit of chain/keys.ts meets this one.
 */
const statusKey = (crossCheck: boolean, what: string, ...rest: (string | number)[]) =>
  ['atropyle', CHAIN_ID, 'status', crossCheck ? 'cross' : 'own', what, ...rest] as const;

/**
 * The chain counters, read on load: /status/ is the page a person opens to see them (ruling T10-R2). The vaults this
 * device found in its own event count go along, so releases and stablecoins cover them too; `round` grows when a count
 * finishes, and the counters are read again.
 */
export function useCounters(round: number): UseQueryResult<ChainCounters> {
  const { crossCheck } = useChainSettings();
  const kv = useKV();
  const s = useSdk().data;
  return useQuery({
    queryKey: statusKey(crossCheck, 'counters', round),
    queryFn: s
      ? async () => {
          const impl = await loadChainImpl();
          const vaults = impl.cachedStats(s, kv)?.cursor.vaults.map((v) => v.vault) ?? [];
          return s.atro.counters({ vaults, maxVaults: STATUS_MAX_VAULTS });
        }
      : skipToken,
    staleTime: 60_000,
  });
}

export function useIntegrity(): UseQueryResult<IntegrityReport> {
  const { crossCheck } = useChainSettings();
  const s = useSdk().data;
  return useQuery({
    queryKey: statusKey(crossCheck, 'integrity'),
    queryFn: s ? () => s.atro.integrity() : skipToken,
    staleTime: 0,
  });
}

/** One eth_blockNumber per node, no retry: a dead node shows at once. */
export function useProbes(impl: typeof Diag | null): UseQueryResult<RpcProbe[]> {
  const { crossCheck } = useChainSettings();
  const s = useSdk().data;
  return useQuery({
    queryKey: statusKey(crossCheck, 'probes'),
    queryFn: s && impl ? () => impl.probeAll(impl.rpcUrlsOf(s.rpc), impl.rpcBlockNumber) : skipToken,
    retry: false,
    staleTime: 0,
  });
}

/** The diagnostics code (viem and the SDK) loads after mount, in a chunk of its own: never in the first load. */
export function useDiagnosticsImpl(): { impl: typeof Diag | null; error: unknown } {
  const [state, setState] = useState<{ impl: typeof Diag | null; error: unknown }>({ impl: null, error: null });
  useEffect(() => {
    let live = true;
    import('./impl/diagnostics').then(
      (impl) => {
        if (live) setState({ impl, error: null });
      },
      (error: unknown) => {
        if (live) setState({ impl: null, error });
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
