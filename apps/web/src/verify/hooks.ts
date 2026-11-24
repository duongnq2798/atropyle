'use client';

import { type QueryClient, skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, useSyncExternalStore } from 'react';
import type { Address } from 'viem';
import { CHAIN_ID, sdkQuery } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
import { useChainSettings } from '@/chain/provider';
import type { Sdk } from '@/chain/types';
import { loadVerifyImpl } from './load';
import type { PolicyVerification, ProofProgress, VaultVerification } from './types';

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

export const verifyKeys = {
  proof: (crossCheck: boolean) => [...chainKeys.all(CHAIN_ID), 'proof', crossCheck ? 'cross' : 'own'] as const,
  vault: (vault: string, policy: boolean, crossCheck: boolean) =>
    [
      ...chainKeys.vault(CHAIN_ID, vault),
      'verify',
      policy ? 'policy' : 'integrity',
      crossCheck ? 'cross' : 'own',
    ] as const,
};

// The proof's progress, by query, outside React state: a page that mounts while the proof runs (the user went from
// /proof/ to a vault and back) still sees the count, although the run was started by the page it left.
const progressById = new Map<string, ProofProgress>();
const listeners = new Set<() => void>();

function publish(id: string, p: ProofProgress | null): void {
  if (p) progressById.set(id, p);
  else progressById.delete(id);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useProgress(id: string): ProofProgress | null {
  return useSyncExternalStore(
    subscribe,
    () => progressById.get(id) ?? null,
    () => null,
  );
}

/**
 * A run is asked for by the user and never retried. It also runs while the browser says it is offline: a paused query
 * would read as 'running' with no progress until the connection came back; a failed read is an error with a Retry.
 */
const SESSION = {
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
  refetchOnWindowFocus: false,
  structuralSharing: false,
  networkMode: 'always',
} as const;

/**
 * The SDK inside the run's own query: a chunk that failed to load or a broken deployment becomes the run's error, and
 * the run's Retry loads the SDK again. The run itself never retries (SESSION), so the SDK keeps the client's policy: a
 * chunk that failed to load is tried again, a broken deployment never.
 */
function sdkFor(client: QueryClient, crossCheck: boolean): Promise<Sdk> {
  return client.query(sdkQuery(crossCheck));
}

export interface ProofState {
  status: RunStatus;
  progress: ProofProgress | null;
  result: PolicyVerification | undefined;
  error: unknown;
  /** Starts the proof, or runs it again after an error. A finished proof is kept for the whole session. */
  run(): void;
}

/** The policy proof of this build's deployment (2^26 combinations, in the worker), only when the user asks. */
export function useProof(): ProofState {
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  const [started, setStarted] = useState(false);
  const queryKey = verifyKeys.proof(crossCheck);
  const id = JSON.stringify(queryKey);
  const q = useQuery({
    queryKey,
    queryFn: started
      ? async () => {
          try {
            const sdk = await sdkFor(client, crossCheck);
            const impl = await loadVerifyImpl();
            return await impl.runProof(sdk, { onProgress: (done, total) => publish(id, { done, total }) });
          } finally {
            publish(id, null);
          }
        }
      : skipToken,
    gcTime: Number.POSITIVE_INFINITY,
    ...SESSION,
  });
  const progress = useProgress(id);
  const { isError, refetch } = q;
  const run = useCallback(() => {
    if (!started) setStarted(true);
    else if (isError) void refetch();
  }, [started, isError, refetch]);

  // A retry after an error is 'running' again, not still 'error'.
  const status: RunStatus =
    q.data !== undefined
      ? 'done'
      : q.fetchStatus === 'fetching'
        ? 'running'
        : q.isError
          ? 'error'
          : started
            ? 'running'
            : 'idle';
  // A vault page that left the session proof running still publishes its count; this page shows it once it runs too.
  return { status, progress: status === 'running' ? progress : null, result: q.data, error: q.error, run };
}

export interface VaultVerifyState {
  status: RunStatus;
  /** The policy proof's progress, while `policy` is on and the proof runs. */
  progress: ProofProgress | null;
  result: VaultVerification | undefined;
  error: unknown;
  retry(): void;
}

/**
 * The integrity checks of one vault through a quorum of RPCs, at once; with `policy`, the policy proof as well
 * (the same run as useProof, joined if it is already going). A transaction on the vault invalidates the result
 * (useInvalidateVault clears every key under the vault's).
 */
export function useVaultVerify(vault: Address | null, policy: boolean): VaultVerifyState {
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  const proofId = JSON.stringify(verifyKeys.proof(crossCheck));
  const q = useQuery({
    queryKey: verifyKeys.vault(vault ?? '', policy, crossCheck),
    queryFn: vault
      ? async () => {
          try {
            const sdk = await sdkFor(client, crossCheck);
            const impl = await loadVerifyImpl();
            return await impl.runVaultVerify(sdk, vault, {
              policy,
              onProgress: (done, total) => publish(proofId, { done, total }),
            });
          } finally {
            if (policy) publish(proofId, null);
          }
        }
      : skipToken,
    ...SESSION,
  });
  const progress = useProgress(proofId);
  const { refetch } = q;
  // Without a vault there is no check to run (a refetch of a skipped query only fails with "Missing queryFn").
  const retry = useCallback(() => {
    if (vault) void refetch();
  }, [vault, refetch]);

  const status: RunStatus =
    q.data !== undefined
      ? 'done'
      : q.fetchStatus === 'fetching'
        ? 'running'
        : q.isError
          ? 'error'
          : vault
            ? 'running'
            : 'idle';
  return {
    status,
    progress: policy && status === 'running' ? progress : null,
    result: q.data,
    error: q.error,
    retry,
  };
}
