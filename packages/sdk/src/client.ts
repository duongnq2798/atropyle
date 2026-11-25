import {
  type Address,
  type Chain,
  createPublicClient,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { factoryAbi } from './abi/index';
import type { VaultAction } from './actions';
import { toAddress } from './address';
import { builderCodeSuffix } from './builder-code';
import { chainOf } from './chain';
import { type ChainName, type Deployment, getDeployment, getTeam } from './deployments/index';
import { AtropyleError, decodeError } from './errors';
import {
  type CastTx,
  castCommand,
  okxCommand,
  parseSignLink,
  type SendCallsParams,
  type SignPayload,
  sendCallsParams,
  signLink,
} from './handoff/index';
import { type InspectOptions, inspectPayload, type SignRequestCheck } from './handoff/inspect';
import { planTemplate } from './plan/templates';
import { PRESETS } from './plan/types';
import { validatePlan } from './plan/validate';
import { fetchPolicyProgram, modelEngine, type PolicyEngine, programEngine } from './policy/engine';
import { type Timeline, timelineOf } from './policy/timeline';
import { prepareAction, whatIf } from './prepare/actions';
import { prepareCreateVault } from './prepare/create';
import type { CreateVaultOptions, PrepareContext, PrepareOptions, TxPlan, WhatIfReport } from './prepare/types';
import { checkPlan, type PlanCheck } from './read/check-plan';
import { createReadContext, type ReadContext, type SdkEvent } from './read/context';
import { type ChainCounters, type CountersOptions, readCounters } from './read/counters';
import { readEvents, type VaultEvent } from './read/events';
import { type FeeQuote, readFees } from './read/fees';
import { netlistSource } from './read/netlists';
import { isRegistered } from './read/registered';
import { type ScanOptions, type ScanResult, scanEvents } from './read/scan';
import { readSnapshot, rolesOf } from './read/snapshot';
import { readStats, type Stats, type StatsCursor } from './read/stats';
import type { VaultSnapshot, VaultStatus } from './read/types';
import { readVaultsOf, type VaultRef } from './read/vaults';
import { type SendOptions, type SendResult, sendPlan } from './send';
import { readTransport } from './transports';
import type { Role, VaultConfig } from './types';
import type { IntegrityReport, PolicyVerification, VaultVerification, VerifyPolicyOptions } from './verify/index';

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
  /**
   * True when the deployment's factory created this vault (`factory.isVault`), at `o.blockNumber` or the latest block.
   * The snapshot's `binding.factory` is read from the vault itself and proves nothing; `prepare` refuses a vault for
   * which this is false.
   */
  registered(o?: { blockNumber?: bigint }): Promise<boolean>;
  status(): Promise<VaultStatus>;
  config(): Promise<VaultConfig>;
  roleOf(account: string): Promise<Role[]>;
  timeline(o?: { now?: bigint }): Promise<Timeline>;
  events(o?: { fromBlock?: bigint; toBlock?: bigint }): Promise<VaultEvent[]>;
  /** Predicted effect of `action` signed by `o.as`, plus a simulation of the call (spec §5.2). */
  whatIf(action: VaultAction, o: { as: string; at?: bigint }): Promise<WhatIfReport>;
  /** Calldata, simulation and typed summaries for `action`, as one or more transactions `o.as` must sign. */
  prepare(action: VaultAction, o: PrepareOptions): Promise<TxPlan>;
  /** Spec §5.4. `policy: false` skips the 2^26 proof (structure, binding and timeline only). */
  verify(o?: { policy?: boolean }): Promise<VaultVerification>;
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
  /** Vault creations and vault events since a cursor, for the Worker's cron and bots (spec §9.5). */
  scan(o?: ScanOptions): Promise<ScanResult>;
  /**
   * Traction counters from view functions at one block, each also outside the team (the owners listed in
   * deployments/team.json unless `o.team` says otherwise). A few calls per vault read, no eth_getLogs.
   */
  counters(o?: CountersOptions): Promise<ChainCounters>;
  vault(address: string): VaultHandle;
  /** Exhaustive check of the on-chain policy netlist against this repository, read from two operators (spec §5.4). */
  verifyPolicy(o?: VerifyPolicyOptions): Promise<PolicyVerification>;
  /** Cheap deployment checks (code hashes, factory wiring, CPU), read from two operators. */
  integrity(): Promise<IntegrityReport>;
  readonly prepare: { createVault(plan: unknown, o: CreateVaultOptions): Promise<TxPlan> };
  checkPlan(plan: unknown, o: { owner: string; drill?: boolean }): Promise<PlanCheck>;
  /** Sends each step with `wallet` in order and waits for the receipts (spec §5.2). Nothing is retried. */
  send(plan: TxPlan, wallet: WalletClient, o?: SendOptions): Promise<SendResult>;
  readonly handoff: {
    link(plan: TxPlan | SignPayload, base?: string): string;
    parse(link: string): SignPayload;
    cast(tx: CastTx, rpcUrl?: string): string;
    calls(plan: TxPlan | SignPayload): SendCallsParams;
    okx(tx: CastTx): string;
    /**
     * Decodes, whitelists and re-simulates a signing request (spec §15). Accepts a payload or a full link. A request
     * that gives a Drill vault an allowance is `ok` only with `confirmed`: the addresses of `confirm`, typed again.
     */
    inspect(request: SignPayload | string, o?: InspectOptions): Promise<SignRequestCheck>;
  };
}

/**
 * Error boundary of the client: whatever a read or a prepare throws (a viem error from the RPC, a bug) leaves as an
 * AtropyleError, so callers never see a raw viem error. An AtropyleError passes through unchanged.
 */
async function guard<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw decodeError(e);
  }
}

/** The same boundary for the pure handoff functions. */
function guardSync<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw decodeError(e);
  }
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
    // A hostile token can revert with OffchainLookup; following it would make the host fetch an attacker-chosen URL.
    ccipRead: false,
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

  // The verify code (simulator included) is loaded on first use, so the main entry stays small (spec §5.1).
  type VerifyModule = typeof import('./verify/index');
  type VerifyEnv = { v: VerifyModule; vctx: ReadContext; rpcs: number; operators: PublicClient[] };
  let verifyEnv: Promise<VerifyEnv> | null = null;
  const loadVerify = () => {
    const p = import('./verify/index').then((v): VerifyEnv => {
      const transports = options.verifyTransports ?? deployment.quorumRpcUrls.map((group) => readTransport(group));
      const clientOf = (transport: Transport) =>
        createPublicClient({
          chain,
          transport,
          cacheTime: 0,
          // Same reason as the read client: never follow an OffchainLookup to an attacker-chosen URL.
          ccipRead: false,
        }) as PublicClient;
      return {
        v,
        vctx: createReadContext(deployment, clientOf(v.quorumTransport(transports)), options.logger),
        rpcs: transports.length,
        // P9 asks each operator on its own, so a wrong step() answer is pinned on the operator that gave it.
        operators: transports.map(clientOf),
      };
    });
    verifyEnv = p;
    // A failed load or setup must not stay cached.
    p.catch(() => {
      if (verifyEnv === p) verifyEnv = null;
    });
    return p;
  };
  const verifyContext = () => verifyEnv ?? loadVerify();
  let policyCache: { seed: bigint | undefined; p: Promise<PolicyVerification> } | null = null;
  // Note: a run that is cached or already in flight ignores the `onProgress` of a later caller. A call without a seed
  // reuses the cached run whatever its seed; a call with another seed runs again.
  const verifyPolicy = (o: VerifyPolicyOptions = {}): Promise<PolicyVerification> =>
    guard(async () => {
      const run = async () => {
        const { v, vctx, rpcs, operators } = await verifyContext();
        const seed = o.p9Seed ?? v.randomSeed();
        v.checkSeed(seed);
        vctx.log({ type: 'verify', what: 'policy' });
        const bundle = await v.readPolicyBundle(vctx.client, deployment, rpcs, { p9: { operators, seed } });
        return v.evaluatePolicyBundle(bundle, o);
      };
      if (o.blocks !== undefined) return run();
      if (!policyCache || (o.p9Seed !== undefined && policyCache.seed !== o.p9Seed)) {
        const entry = { seed: o.p9Seed, p: run() };
        policyCache = entry;
        // A failure (a quorum outage, a dead RPC) must not stay cached: the next call asks again.
        entry.p.catch(() => {
          if (policyCache === entry) policyCache = null;
        });
      }
      return policyCache.p;
    });

  const px: PrepareContext = { ...ctx, suffix: builderCode ? builderCodeSuffix(builderCode) : null, engineFor };

  function vault(address: string): VaultHandle {
    const addr = toAddress(address, 'vault');
    const snapshot = (o?: { blockNumber?: bigint }) => guard(() => readSnapshot(ctx, addr, o?.blockNumber));
    return {
      address: addr,
      snapshot,
      registered: (o) => guard(() => isRegistered(ctx, addr, o?.blockNumber)),
      status: async () => (await snapshot()).status,
      config: async () => (await snapshot()).config,
      roleOf: (account) =>
        guard(async () => {
          // Validated before any RPC call: a malformed address fails the same way whatever the network does.
          const who = toAddress(account, 'account');
          return rolesOf(await readSnapshot(ctx, addr), who);
        }),
      timeline: (o) =>
        guard(async () => {
          const s = await readSnapshot(ctx, addr);
          return timelineOf(await engineFor(s.binding.cpu, s.binding.policyId), s, o?.now);
        }),
      events: (o) => guard(() => readEvents(ctx, addr, o)),
      whatIf: (action, o) => guard(() => whatIf(px, addr, action, o)),
      prepare: (action, o) => guard(() => prepareAction(px, addr, action, o)),
      verify: (o) =>
        guard(async () => {
          const { v, vctx, rpcs } = await verifyContext();
          return v.verifyVault(vctx, addr, rpcs, o?.policy === false ? null : () => verifyPolicy());
        }),
    };
  }

  return {
    deployment,
    chain,
    publicClient,
    builderCode,
    plan: { validate: validatePlan, template: planTemplate, presets: PRESETS },
    engine: () => guard(() => engineFor(deployment.cpu, deployment.policyId)),
    engineFor: (cpu, policyId) => guard(() => engineFor(cpu, policyId)),
    fees: () => guard(() => readFees(ctx)),
    vaultsOf: (account, o) => guard(() => readVaultsOf(ctx, account, o)),
    predictVault: (owner, salt) =>
      guard(async () =>
        publicClient.readContract({
          address: deployment.factory,
          abi: factoryAbi,
          functionName: 'predictVault',
          args: [toAddress(owner, 'owner'), salt],
        }),
      ),
    stats: (o) => guard(() => readStats(ctx, o)),
    scan: (o) => guard(() => scanEvents(ctx, o)),
    counters: (o) =>
      guard(() => readCounters(ctx, { ...o, team: o?.team ?? getTeam(deployment).map((m) => m.address) })),
    vault,
    verifyPolicy,
    integrity: () =>
      guard(async () => {
        const { v, vctx, rpcs } = await verifyContext();
        return v.readIntegrity(vctx.client, deployment, rpcs);
      }),
    prepare: { createVault: (plan, o) => guard(() => prepareCreateVault(px, plan, o)) },
    checkPlan: (plan, o) => guard(() => checkPlan(ctx, plan, o)),
    send: (plan, wallet, o) => guard(() => sendPlan(ctx, plan, wallet, o)),
    handoff: {
      link: (plan, base) =>
        guardSync(() => {
          const root = base ?? deployment.webUrl;
          if (!root) {
            throw new AtropyleError('INVALID_OPTIONS', { message: 'This deployment has no web app URL; pass `base`.' });
          }
          return signLink(plan, root);
        }),
      parse: (link) => guardSync(() => parseSignLink(link)),
      cast: (tx, rpcUrl) => guardSync(() => castCommand(tx, rpcUrl ?? deployment.rpcUrls[0])),
      calls: (plan) => guardSync(() => sendCallsParams(plan)),
      okx: (tx) => guardSync(() => okxCommand(tx)),
      inspect: (request, o) =>
        guard(() => inspectPayload(ctx, typeof request === 'string' ? parseSignLink(request) : request, o)),
    },
  };
}
