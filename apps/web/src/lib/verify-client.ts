import {
  AtropyleError,
  type AtropyleErrorJson,
  createReadContext,
  type PolicyVerification,
  readTransport,
} from '@atropyle/sdk';
import type { PolicyBundle, VaultVerification } from '@atropyle/sdk/verify';
import { type Address, createPublicClient, type PublicClient } from 'viem';
import type { Sdk } from './sdk';

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
  new Worker(new URL('../workers/verify.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export function errorFromJson(j: AtropyleErrorJson): AtropyleError {
  return new AtropyleError(j.code, { message: j.message, hint: j.hint, details: j.details });
}

interface EvalOptions {
  onProgress?(done: number, total: number): void;
  blocks?: number;
  worker?: WorkerFactory;
}

/** The 2^26 enumeration runs off the main thread; the worker makes no network request (Plan 4, decision 8). */
export function evaluateInWorker(bundle: PolicyBundle, o: EvalOptions = {}): Promise<PolicyVerification> {
  return new Promise((resolve, reject) => {
    const w = (o.worker ?? createVerifyWorker)();
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        o.onProgress?.(m.done, m.total);
        return;
      }
      w.terminate();
      if (m.type === 'result') resolve(m.result);
      else reject(errorFromJson(m.error));
    };
    w.onerror = (e) => {
      w.terminate();
      const why = e.message ?? 'the proof worker failed to load';
      reject(new AtropyleError('UNKNOWN', { message: `The proof worker stopped: ${why}` }));
    };
    const msg: WorkerIn = { type: 'evaluate', bundle };
    if (o.blocks !== undefined) msg.blocks = o.blocks;
    w.postMessage(msg);
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

const proofs = new Map<string, Promise<PolicyVerification>>();

/** `#/proof` then `#/v/<vault>/verify` run the 2^26 enumeration only once per session (Plan 4, decision 8). */
export function runProof(sdk: Sdk, o: EvalOptions = {}): Promise<PolicyVerification> {
  const cacheable = o.blocks === undefined;
  const key = proofKey(sdk);
  const hit = cacheable ? proofs.get(key) : undefined;
  if (hit) return hit;
  const p = (async () => {
    const { readPolicyBundle } = await import('@atropyle/sdk/verify');
    const q = await quorumClient(sdk);
    const bundle = await readPolicyBundle(q.client, sdk.deployment, q.rpcs);
    return evaluateInWorker(bundle, o);
  })();
  if (cacheable) {
    proofs.set(key, p);
    p.catch(() => proofs.delete(key));
  }
  return p;
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
