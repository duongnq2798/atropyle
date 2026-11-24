import {
  AtropyleError,
  type AtropyleErrorJson,
  createReadContext,
  type PolicyVerification,
  readTransport,
} from '@atropyle/sdk';
import type { PolicyBundle, VaultVerification } from '@atropyle/sdk/verify';
import { type Address, createPublicClient, type PublicClient } from 'viem';
import type { Sdk } from '@/chain/types';

export type WorkerIn = { type: 'evaluate'; bundle: PolicyBundle; blocks?: number };
export type WorkerOut =
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; result: PolicyVerification }
  | { type: 'error'; error: AtropyleErrorJson };

export interface WorkerLike {
  postMessage(m: WorkerIn): void;
  terminate(): void;
  onmessage: ((e: { data: WorkerOut }) => void) | null;
  /** A module worker that fails to load fires a plain Event, which has no `message`. */
  onerror: ((e: { message?: string }) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

export const createVerifyWorker: WorkerFactory = () =>
  new Worker(new URL('../../workers/verify.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export function errorFromJson(j: AtropyleErrorJson): AtropyleError {
  return new AtropyleError(j.code, { message: j.message, hint: j.hint, details: j.details });
}

interface EvalOptions {
  onProgress?(done: number, total: number): void;
  blocks?: number;
  worker?: WorkerFactory;
  /**
   * Stops the run (ruling R14), for a page the user leaves: the worker is terminated and the promise rejects with an
   * AbortError. A signal that has already aborted starts no worker.
   */
  signal?: AbortSignal;
}

/** How a run whose signal aborted rejects. */
function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

/** The 2^26 enumeration runs off the main thread; the worker makes no network request (Plan 4, decision 8). */
export function evaluateInWorker(bundle: PolicyBundle, o: EvalOptions = {}): Promise<PolicyVerification> {
  return new Promise((resolve, reject) => {
    const { signal } = o;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const w = (o.worker ?? createVerifyWorker)();
    const onAbort = () => {
      // A message the worker posted before it stopped must not reach the caller any more.
      w.onmessage = null;
      w.onerror = null;
      w.terminate();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    /** The run ended by itself: the worker stops, and a later abort has nothing left to stop. */
    const stop = () => {
      signal?.removeEventListener('abort', onAbort);
      w.terminate();
    };
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        o.onProgress?.(m.done, m.total);
        return;
      }
      stop();
      if (m.type === 'result') resolve(m.result);
      else reject(errorFromJson(m.error));
    };
    w.onerror = (e) => {
      stop();
      const why = e.message ?? 'the proof worker failed to load';
      reject(new AtropyleError('UNKNOWN', { message: `The proof worker stopped: ${why}` }));
    };
    const msg: WorkerIn = { type: 'evaluate', bundle };
    if (o.blocks !== undefined) msg.blocks = o.blocks;
    try {
      w.postMessage(msg);
    } catch (cause) {
      // For example a DataCloneError: the worker never got the job, so do not leave it running.
      stop();
      const why = cause instanceof Error ? cause.message : String(cause);
      reject(new AtropyleError('UNKNOWN', { message: `The proof worker could not start: ${why}`, cause }));
    }
  });
}

/**
 * Same client as the SDK's own verify client: the vault comes from the URL, so a hostile contract must not make
 * viem follow an OffchainLookup to an attacker-chosen URL, and the quorum block must not be cached.
 */
export async function quorumClient(sdk: Pick<Sdk, 'atro' | 'rpc'>): Promise<{ client: PublicClient; rpcs: number }> {
  const { quorumTransport } = await import('@atropyle/sdk/verify');
  const transports = sdk.rpc.verify.map((group) => readTransport(group));
  const client = createPublicClient({
    chain: sdk.atro.chain,
    transport: quorumTransport(transports),
    cacheTime: 0,
    ccipRead: false,
  }) as PublicClient;
  return { client, rpcs: transports.length };
}

export function proofKey(sdk: Pick<Sdk, 'deployment' | 'rpc'>): string {
  const groups = sdk.rpc.verify.map((g) => g.join(',')).join('|');
  return `${sdk.deployment.chainId}:${sdk.deployment.factory.toLowerCase()}:${groups}`;
}

type ProgressFn = (done: number, total: number) => void;

interface Flight {
  promise: Promise<PolicyVerification>;
  listeners: Set<ProgressFn>;
  last: [number, number] | null;
}

const proofs = new Map<string, Flight>();

/**
 * `#/proof` then `#/v/<vault>/verify` run the 2^26 enumeration only once per session (Plan 4, decision 8).
 * A caller that joins a proof already in flight still gets its progress. A run with `blocks` or a `signal` is a
 * fresh run of its own and is never cached, so aborting it stops only its own worker, never a proof another page
 * has joined.
 */
export function runProof(sdk: Sdk, o: EvalOptions = {}): Promise<PolicyVerification> {
  if (o.blocks !== undefined || o.signal) {
    return start(sdk, o, new Set(o.onProgress ? [o.onProgress] : []), null);
  }
  const key = proofKey(sdk);
  const hit = proofs.get(key);
  if (hit) {
    if (o.onProgress) {
      hit.listeners.add(o.onProgress);
      if (hit.last) o.onProgress(hit.last[0], hit.last[1]);
    }
    return hit.promise;
  }
  const flight: Flight = { promise: null as unknown as Promise<PolicyVerification>, listeners: new Set(), last: null };
  if (o.onProgress) flight.listeners.add(o.onProgress);
  flight.promise = start(sdk, o, flight.listeners, flight);
  proofs.set(key, flight);
  flight.promise.then(
    () => flight.listeners.clear(),
    () => {
      flight.listeners.clear();
      if (proofs.get(key) === flight) proofs.delete(key);
    },
  );
  return flight.promise;
}

function start(
  sdk: Sdk,
  o: EvalOptions,
  listeners: Set<ProgressFn>,
  flight: Flight | null,
): Promise<PolicyVerification> {
  return (async () => {
    if (o.signal?.aborted) throw abortError();
    const { readPolicyBundle } = await import('@atropyle/sdk/verify');
    const q = await quorumClient(sdk);
    const bundle = await readPolicyBundle(q.client, sdk.deployment, q.rpcs);
    // A signal that aborted during the read starts no worker: evaluateInWorker rejects first.
    return evaluateInWorker(bundle, {
      blocks: o.blocks,
      worker: o.worker,
      signal: o.signal,
      onProgress: (done, total) => {
        if (flight) flight.last = [done, total];
        for (const fn of [...listeners]) fn(done, total);
      },
    });
  })();
}

export async function runVaultVerify(
  sdk: Sdk,
  vault: Address,
  o: { policy: boolean; onProgress?(done: number, total: number): void; worker?: WorkerFactory },
): Promise<VaultVerification> {
  const { verifyVault } = await import('@atropyle/sdk/verify');
  const q = await quorumClient(sdk);
  const vctx = createReadContext(sdk.deployment, q.client);
  const policy = o.policy ? () => runProof(sdk, { onProgress: o.onProgress, worker: o.worker }) : null;
  return verifyVault(vctx, vault, q.rpcs, policy);
}
