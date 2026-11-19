import { type Address, type Chain, createPublicClient, type Hex, type PublicClient, type Transport } from 'viem';
import { factoryAbi } from './abi/index';
import { toAddress } from './address';
import { chainOf } from './chain';
import { type ChainName, type Deployment, getDeployment } from './deployments/index';
import { planTemplate } from './plan/templates';
import { PRESETS } from './plan/types';
import { validatePlan } from './plan/validate';
import { fetchPolicyProgram, modelEngine, type PolicyEngine, programEngine } from './policy/engine';
import { type Timeline, timelineOf } from './policy/timeline';
import { createReadContext, type SdkEvent } from './read/context';
import { readEvents, type VaultEvent } from './read/events';
import { type FeeQuote, readFees } from './read/fees';
import { netlistSource } from './read/netlists';
import { readSnapshot, rolesOf } from './read/snapshot';
import { readStats, type Stats, type StatsCursor } from './read/stats';
import type { VaultSnapshot, VaultStatus } from './read/types';
import { readVaultsOf, type VaultRef } from './read/vaults';
import { readTransport } from './transports';
import type { Role, VaultConfig } from './types';

export interface AtropyleOptions {
  chain: ChainName | Deployment;
  /** Ordinary reads. Default: fallback over deployment.rpcUrls. */
  transport?: Transport;
  /** One transport per independent operator, for verification (spec §5.4). */
  verifyTransports?: Transport[];
  /** ERC-8021 builder code for every prepared calldata. undefined = deployment default, null = off. */
  builderCode?: string | null;
  logger?: (e: SdkEvent) => void;
}

export interface VaultHandle {
  readonly address: Address;
  snapshot(o?: { blockNumber?: bigint }): Promise<VaultSnapshot>;
  status(): Promise<VaultStatus>;
  config(): Promise<VaultConfig>;
  roleOf(account: string): Promise<Role[]>;
  timeline(o?: { now?: bigint }): Promise<Timeline>;
  events(o?: { fromBlock?: bigint; toBlock?: bigint }): Promise<VaultEvent[]>;
}

export interface AtropyleClient {
  readonly deployment: Deployment;
  readonly chain: Chain;
  readonly publicClient: PublicClient;
  readonly builderCode: string | null;
  readonly plan: { validate: typeof validatePlan; template: typeof planTemplate; presets: typeof PRESETS };
  /** Engine for the deployment's own CPU and policy. */
  engine(): Promise<PolicyEngine>;
  engineFor(cpu: Address, policyId: bigint): Promise<PolicyEngine>;
  fees(): Promise<FeeQuote>;
  /** Newest `limit` (default 100) vaults of the factory index where `account` still has a role, newest first. */
  vaultsOf(account: string, o?: { limit?: number }): Promise<VaultRef[]>;
  predictVault(owner: string, salt: Hex): Promise<Address>;
  stats(o?: {
    fromBlock?: bigint;
    toBlock?: bigint;
    resume?: StatsCursor;
    onProgress?: (done: number, total: number) => void;
  }): Promise<Stats>;
  vault(address: string): VaultHandle;
}

export function createAtropyle(options: AtropyleOptions): AtropyleClient {
  const deployment = getDeployment(options.chain);
  const chain = chainOf(deployment);
  // cacheTime 0: viem caches getBlockNumber for the polling interval (4 s), which would pin a read made right after a
  // transaction to the block before it.
  const publicClient = createPublicClient({
    chain,
    transport: options.transport ?? readTransport(deployment.rpcUrls),
    cacheTime: 0,
  }) as PublicClient;
  const builderCode = options.builderCode === undefined ? deployment.builderCode : options.builderCode;
  const ctx = createReadContext(deployment, publicClient, options.logger);
  const engines = new Map<string, Promise<PolicyEngine>>();

  function engineFor(cpu: Address, policyId: bigint): Promise<PolicyEngine> {
    const key = `${cpu.toLowerCase()}:${policyId}`;
    let e = engines.get(key);
    if (!e) {
      e = fetchPolicyProgram(cpu, policyId, netlistSource(publicClient, cpu)).then((f) =>
        f ? programEngine(f.program) : modelEngine(),
      );
      // A failed fetch (a flaky RPC) must not stay cached: the next call asks again.
      e.catch(() => engines.delete(key));
      engines.set(key, e);
    }
    return e;
  }

  function vault(address: string): VaultHandle {
    const addr = toAddress(address, 'vault');
    const snapshot = (o?: { blockNumber?: bigint }) => readSnapshot(ctx, addr, o?.blockNumber);
    return {
      address: addr,
      snapshot,
      status: async () => (await snapshot()).status,
      config: async () => (await snapshot()).config,
      roleOf: async (account) => rolesOf(await snapshot(), account),
      timeline: async (o) => {
        const s = await snapshot();
        return timelineOf(await engineFor(s.binding.cpu, s.binding.policyId), s, o?.now);
      },
      events: (o) => readEvents(ctx, addr, o),
    };
  }

  return {
    deployment,
    chain,
    publicClient,
    builderCode,
    plan: { validate: validatePlan, template: planTemplate, presets: PRESETS },
    engine: () => engineFor(deployment.cpu, deployment.policyId),
    engineFor,
    fees: () => readFees(ctx),
    vaultsOf: (account, o) => readVaultsOf(ctx, account, o),
    predictVault: (owner, salt) =>
      publicClient.readContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: 'predictVault',
        args: [toAddress(owner, 'owner'), salt],
      }),
    stats: (o) => readStats(ctx, o),
    vault,
  };
}
