import { type Address, decodeFunctionData, erc20Abi, type Hex, isAddress, maxUint256, toFunctionSelector } from 'viem';
import { erc1155Abi, factoryAbi, vaultAbi } from '../abi/index';
import { sameAddress, ZERO_ADDRESS } from '../address';
import { isBuilderCode, parseBuilderCodeSuffix } from '../builder-code';
import { AtropyleError } from '../errors';
import { planWarnings, recoveryPowerWarning } from '../plan/validate';
import { type ExitTimes, exitTimes } from '../policy/exit';
import { GUARDIAN_WARNING } from '../prepare/actions';
import { approvalForAllWarning, unlimitedApprovalWarning } from '../prepare/approvals';
import { simulateTxs } from '../prepare/simulate';
import { summarize } from '../prepare/summary';
import type { ActionName, Simulation } from '../prepare/types';
import type { ReadContext } from '../read/context';
import { ASSET_KINDS, type Asset, type Heir, type Timing, type Warning } from '../types';
import { parsePayloadBytes, payloadBytes, type SignPayload } from './payload';

/** The terms of the vault a createVault step creates, decoded from its calldata. */
export interface CreateTerms {
  vault: Address;
  drill: boolean;
  heirs: Heir[];
  guardians: Address[];
  k: number;
  recoveryEnabled: boolean;
  timing: Timing;
  /** When the assets can first leave the owner's wallet if the owner never checks in again, route by route. */
  exit: ExitTimes;
  /** Timestamp of the block the check read. The vault cannot be created before it. */
  readAt: bigint;
  /** `readAt` + `exit.earliest.after`: whenever the step is signed, no asset can leave before this. null: never. */
  earliestAt: bigint | null;
}

export interface InspectedStep {
  index: number;
  to: Address;
  value: bigint;
  action: ActionName | null;
  /** Rebuilt from the decoded calldata and chain reads; nothing in the link is shown as is. */
  summary: string | null;
  /** The warnings the plan that produced this step would carry, rebuilt from the decoded calldata. */
  warnings: Warning[];
  allowed: boolean;
  /** Why the step is refused; null when allowed. */
  reason: string | null;
  builderCodes: string[] | null;
  simulation: Simulation;
  /** Who gets what and how early, for a createVault step; null for any other step. */
  create: CreateTerms | null;
}

export interface ConfirmAddress {
  /** The step that creates the vault, or the first step that gives it an allowance. */
  step: number;
  vault: Address;
  role: 'heir' | 'guardian';
  /** Position in the vault's list of heirs or guardians. */
  index: number;
  account: Address;
  /** The heir's share in basis points; null for a guardian. */
  bps: number | null;
}

/**
 * A Drill releases within minutes, so a link that creates one (or gives one an allowance) and also grants a token
 * allowance can drain a wallet before anyone notices. Such a link is blocked until the signer types again, from
 * their own records, every address that can receive the assets: the heirs of each Drill vault involved, and its
 * guardians when wallet recovery is on (they choose the wallet).
 */
export interface AddressConfirmation {
  reason: 'DRILL_WITH_ALLOWANCE';
  addresses: ConfirmAddress[];
  /** True when the `confirmed` option holds every one of `addresses`, in this order. */
  confirmed: boolean;
}

export interface SignRequestCheck {
  /** Every step allowed, chain matches, no simulation failed, and any required address confirmation given. */
  ok: boolean;
  chainId: number;
  from: Address;
  vault: Address | null;
  steps: InspectedStep[];
  /** The addresses the signer must type again before signing; null when the request needs none. */
  confirm: AddressConfirmation | null;
}

export interface InspectOptions {
  /** What the signer typed for each of `confirm.addresses`, in the same order. Never filled in from the link. */
  confirmed?: readonly string[];
}

interface VaultPeople {
  drill: boolean;
  heirs: Heir[];
  guardians: Address[];
  k: number;
  recoveryEnabled: boolean;
  timing: Timing;
}

interface KnownVault {
  owner: Address;
  assets: Asset[];
  /** Read on first need; a vault the payload creates has them from its calldata. Later steps of the payload update them. */
  people: VaultPeople | null;
}

type Verdict =
  | {
      action: ActionName;
      summary: string;
      vault?: Address;
      warnings?: Warning[];
      create?: CreateTerms;
      /** The spender or operator this step gives an allowance to; absent for revocations and every other call. */
      grant?: Address;
    }
  | { refuse: string };

const MAX_BUILDER_CODES = 8;
const MAX_BUILDER_CODE_LENGTH = 64;

/** A request from outside is validated like a link is: the same checks, the same limits, checksummed addresses. */
function normalize(request: SignPayload): SignPayload {
  try {
    return parsePayloadBytes(payloadBytes(request));
  } catch (e) {
    throw new AtropyleError('LINK_INVALID', {
      message: `The signing request is invalid: ${e instanceof AtropyleError ? e.message : 'it is not a sign payload'}`,
      cause: e,
    });
  }
}

/** Codes read from calldata are shown to people: only what the encoder itself would write, and not many. */
const validCodes = (codes: readonly string[]) =>
  codes.length <= MAX_BUILDER_CODES && codes.every((c) => c.length <= MAX_BUILDER_CODE_LENGTH && isBuilderCode(c));

const APPROVE = toFunctionSelector('function approve(address,uint256)');
const SET_APPROVAL_FOR_ALL = toFunctionSelector('function setApprovalForAll(address,bool)');
/** Allowance calls Atropyle never asks for: named in the refusal, so nobody mistakes them for an unknown call. */
const OTHER_ALLOWANCES = new Map<string, string>(
  [
    ['function increaseAllowance(address,uint256)', 'increaseAllowance'],
    ['function increaseApproval(address,uint256)', 'increaseApproval'],
    ['function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)', 'permit (EIP-2612)'],
    ['function permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)', 'permit (DAI)'],
    ['function approve(address,address,uint160,uint48)', 'a Permit2 approval'],
  ].map(([sig, name]) => [toFunctionSelector(sig), name]),
);
const SKIPPED: Simulation = { ok: 'skipped', reason: 'NOT_ALLOWED' };

const toAssets = (a: readonly { kind: number; token: Address; id: bigint; heir: number }[]): Asset[] =>
  a.map((x) => ({ kind: ASSET_KINDS[x.kind], token: x.token, id: x.id, heir: x.heir }));

/**
 * What the signer typed matches when it is a valid address (in mixed case, with a valid checksum, so most typos do not
 * pass) equal to `expected`.
 */
export function typedAddressMatches(typed: string, expected: Address): boolean {
  const t = typed.trim();
  return isAddress(t) && t.toLowerCase() === expected.toLowerCase();
}

function confirmationOf(addresses: ConfirmAddress[], typed: readonly string[] | undefined): AddressConfirmation {
  const confirmed =
    typed !== undefined &&
    typed.length === addresses.length &&
    addresses.every((a, i) => typedAddressMatches(typed[i], a.account));
  return { reason: 'DRILL_WITH_ALLOWANCE', addresses, confirmed };
}

/**
 * The whitelist of spec §15: the factory's createVault; any call to a vault the factory created; approving a fee
 * token to the factory (at most the full fee); approving an asset to a vault owned by the signer (including the one
 * the same link creates). Everything else is refused. A request that gives a Drill vault the power to move tokens
 * also needs `confirm` (see AddressConfirmation).
 */
export async function inspectPayload(
  ctx: ReadContext,
  request: SignPayload,
  opts: InspectOptions = {},
): Promise<SignRequestCheck> {
  const p = normalize(request);
  const d = ctx.deployment;
  const c = ctx.client;
  const chainOk = p.chainId === d.chainId;
  const blockNumber = chainOk ? await c.getBlockNumber() : 0n;
  const known = new Map<string, KnownVault | null>();
  let readAt: bigint | null = null;

  async function vaultInfo(a: Address): Promise<KnownVault | null> {
    const key = a.toLowerCase();
    if (known.has(key)) return known.get(key) ?? null;
    let info: KnownVault | null = null;
    const isVault = await c.readContract({
      address: d.factory,
      abi: factoryAbi,
      functionName: 'isVault',
      args: [a],
      blockNumber,
    });
    if (isVault) {
      const at = { address: a, abi: vaultAbi, blockNumber } as const;
      const [owner, assets] = await Promise.all([
        c.readContract({ ...at, functionName: 'owner' }),
        c.readContract({ ...at, functionName: 'assets' }),
      ]);
      info = { owner, assets: toAssets(assets), people: null };
    }
    known.set(key, info);
    return info;
  }

  async function peopleOf(a: Address, info: KnownVault): Promise<VaultPeople> {
    if (info.people) return info.people;
    const at = { address: a, abi: vaultAbi, blockNumber } as const;
    const [drill, heirs, guardians, k, recoveryEnabled, timing] = await Promise.all([
      c.readContract({ ...at, functionName: 'drill' }),
      c.readContract({ ...at, functionName: 'heirs' }),
      c.readContract({ ...at, functionName: 'guardians' }),
      c.readContract({ ...at, functionName: 'k' }),
      c.readContract({ ...at, functionName: 'recoveryEnabled' }),
      c.readContract({ ...at, functionName: 'timing' }),
    ]);
    info.people = {
      drill,
      heirs: heirs.map((h) => ({ account: h.account, bps: h.bps })),
      guardians: [...guardians],
      k,
      recoveryEnabled,
      timing: { period: timing.period, threshold: timing.threshold, window: timing.window },
    };
    return info.people;
  }

  async function blockTime(): Promise<bigint> {
    readAt ??= (await c.getBlock({ blockNumber })).timestamp;
    return readAt;
  }

  async function factoryCall(data: Hex): Promise<Verdict> {
    let call: ReturnType<typeof decodeFunctionData<typeof factoryAbi>>;
    try {
      call = decodeFunctionData({ abi: factoryAbi, data });
    } catch {
      return { refuse: 'unknown factory call' };
    }
    if (call.functionName !== 'createVault') return { refuse: `factory function ${call.functionName} is not allowed` };
    const [cfg, salt, drill, feeTokenArg] = call.args;
    const vault = await c.readContract({
      address: d.factory,
      abi: factoryAbi,
      functionName: 'predictVault',
      args: [p.from, salt],
      blockNumber,
    });
    const assets = toAssets(cfg.assets);
    const people: VaultPeople = {
      drill,
      heirs: cfg.heirs.map((h) => ({ account: h.account, bps: h.bps })),
      guardians: [...cfg.guardians],
      k: cfg.k,
      recoveryEnabled: cfg.recoveryEnabled,
      timing: { period: cfg.timing.period, threshold: cfg.timing.threshold, window: cfg.timing.window },
    };
    known.set(vault.toLowerCase(), { owner: p.from, assets, people });
    let fee = 0n;
    let feeDecimals: number | null = null;
    if (!drill) {
      if (!d.feeTokens.some((t) => sameAddress(t, feeTokenArg)))
        return { refuse: `fee token ${feeTokenArg} is not accepted by the factory` };
      fee = await c.readContract({
        address: d.factory,
        abi: factoryAbi,
        functionName: 'currentFee',
        args: [feeTokenArg],
        blockNumber,
      });
      feeDecimals = (await ctx.token(feeTokenArg, blockNumber)).decimals;
    }
    const summary = summarize.createVault(vault, p.from, {
      ...people,
      assets,
      fee,
      feeToken: drill ? ZERO_ADDRESS : feeTokenArg,
      feeDecimals,
    });
    const exit = exitTimes(people);
    const at = await blockTime();
    const create: CreateTerms = {
      vault,
      ...people,
      heirs: [...people.heirs],
      guardians: [...people.guardians],
      exit,
      readAt: at,
      earliestAt: exit.earliest ? at + BigInt(exit.earliest.after) : null,
    };
    return { action: 'createVault', summary, vault, warnings: planWarnings(people), create };
  }

  async function vaultCall(to: Address, data: Hex, info: KnownVault): Promise<Verdict> {
    let call: ReturnType<typeof decodeFunctionData<typeof vaultAbi>>;
    try {
      call = decodeFunctionData({ abi: vaultAbi, data });
    } catch {
      return { refuse: 'unknown vault call' };
    }
    switch (call.functionName) {
      case 'checkIn':
        return { action: 'checkIn', summary: summarize.checkIn(to), vault: to };
      case 'setHeirs': {
        const heirs = call.args[0].map((h) => ({ account: h.account, bps: h.bps }));
        // Only the signer's own vault takes these calls (onlyOwner); for any other the simulation fails.
        if (sameAddress(info.owner, p.from)) (await peopleOf(to, info)).heirs = heirs;
        return { action: 'setHeirs', summary: summarize.setHeirs(to, heirs), vault: to };
      }
      case 'setGuardians': {
        const [g, k, recoveryEnabled] = call.args;
        const warnings: Warning[] = [];
        if (sameAddress(info.owner, p.from)) {
          const people = await peopleOf(to, info);
          Object.assign(people, { guardians: [...g], k, recoveryEnabled });
          if (recoveryEnabled && k > 0) warnings.push(recoveryPowerWarning(k, g.length, people.timing.window));
        }
        return {
          action: 'setGuardians',
          summary: summarize.setGuardians(to, [...g], k, recoveryEnabled),
          vault: to,
          warnings,
        };
      }
      case 'setTiming': {
        const a = call.args[0];
        const t = { period: a.period, threshold: a.threshold, window: a.window };
        const warnings: Warning[] = [];
        if (sameAddress(info.owner, p.from)) {
          const people = await peopleOf(to, info);
          people.timing = t;
          if (people.recoveryEnabled && people.k > 0) {
            warnings.push(recoveryPowerWarning(people.k, people.guardians.length, t.window));
          }
        }
        return { action: 'setTiming', summary: summarize.setTiming(to, t), vault: to, warnings };
      }
      case 'setAssets': {
        const assets = toAssets(call.args[0]);
        info.assets = assets;
        return { action: 'setAssets', summary: summarize.setAssets(to, assets), vault: to };
      }
      case 'attestDeath':
        return {
          action: 'attestDeath',
          summary: summarize.attestDeath(to, call.args[0]),
          vault: to,
          warnings: [GUARDIAN_WARNING],
        };
      case 'voteRecovery': {
        const target = call.args[0];
        return {
          action: 'voteRecovery',
          summary: summarize.voteRecovery(to, sameAddress(target, ZERO_ADDRESS) ? null : target),
          vault: to,
          warnings: [GUARDIAN_WARNING],
        };
      }
      case 'poke':
        return { action: 'poke', summary: summarize.poke(to), vault: to };
      case 'distribute':
        return { action: 'distribute', summary: summarize.distribute(to), vault: to };
      default:
        return { refuse: `vault function ${call.functionName} is not allowed` };
    }
  }

  async function signerVault(spender: Address): Promise<KnownVault | string> {
    const info = await vaultInfo(spender);
    if (!info) return `the spender ${spender} is not an Atropyle vault`;
    if (!sameAddress(info.owner, p.from)) return `vault ${spender} does not belong to the signer ${p.from}`;
    return info;
  }

  async function tokenCall(to: Address, data: Hex): Promise<Verdict> {
    const selector = data.slice(0, 10).toLowerCase();
    const other = OTHER_ALLOWANCES.get(selector);
    if (other) return { refuse: `${other} is not allowed: Atropyle only asks for approve and setApprovalForAll` };
    try {
      if (selector === APPROVE) {
        const { args } = decodeFunctionData({ abi: erc20Abi, data });
        const [spender, amount] = args as readonly [Address, bigint];
        if (sameAddress(spender, d.factory)) {
          if (!d.feeTokens.some((t) => sameAddress(t, to)))
            return { refuse: `it approves the factory on ${to}, which is not a fee token` };
          const full = await c.readContract({
            address: d.factory,
            abi: factoryAbi,
            functionName: 'fullFee',
            args: [to],
            blockNumber,
          });
          if (amount > full) return { refuse: `it approves more than the full creation fee (${full} base units)` };
          return {
            action: 'approve',
            summary: summarize.approveFee(d.factory, to, amount, (await ctx.token(to, blockNumber)).decimals),
            ...(amount > 0n ? { grant: d.factory } : {}),
          };
        }
        if (sameAddress(spender, ZERO_ADDRESS)) return { action: 'approve', summary: summarize.clear721(to, amount) };
        const v = await signerVault(spender);
        if (typeof v === 'string') return { refuse: v };
        const kind = v.assets.find((a) => sameAddress(a.token, to))?.kind;
        if (kind === 'erc721')
          return {
            action: 'approve',
            summary: summarize.approve721(spender, to, amount),
            vault: spender,
            grant: spender,
          };
        if (amount === 0n) return { action: 'approve', summary: summarize.revoke20(spender, to), vault: spender };
        if (kind === 'erc20') {
          const decimals = (await ctx.token(to, blockNumber)).decimals;
          return {
            action: 'approve',
            summary: summarize.approve20(spender, to, amount === maxUint256 ? null : amount, decimals),
            vault: spender,
            warnings: amount === maxUint256 ? [unlimitedApprovalWarning(to)] : [],
            grant: spender,
          };
        }
        return { refuse: `token ${to} is not an ERC-20 or ERC-721 asset of vault ${spender}` };
      }
      if (selector === SET_APPROVAL_FOR_ALL) {
        const { args } = decodeFunctionData({ abi: erc1155Abi, data });
        const [operator, approved] = args as readonly [Address, boolean];
        const v = await signerVault(operator);
        if (typeof v === 'string') return { refuse: v };
        if (!approved)
          return { action: 'setApprovalForAll', summary: summarize.revokeAll(operator, to), vault: operator };
        if (!v.assets.some((a) => a.kind !== 'erc20' && sameAddress(a.token, to))) {
          return { refuse: `contract ${to} is not an NFT asset of vault ${operator}` };
        }
        return {
          action: 'setApprovalForAll',
          summary: summarize.approveAll(operator, to),
          vault: operator,
          warnings: [approvalForAllWarning(to)],
          grant: operator,
        };
      }
    } catch {
      return { refuse: 'malformed calldata' };
    }
    return { refuse: `unknown call to ${to}` };
  }

  /**
   * The Drill vaults that a granting request involves: every Drill it creates, as soon as it grants any allowance,
   * and every Drill vault already on chain that it grants one to. Their final heirs and, with recovery on, guardians
   * (after every setHeirs and setGuardians of the request) are what the signer must type again.
   */
  async function drillConfirmation(
    made: { step: number; vault: Address }[],
    given: { step: number; spender: Address }[],
  ): Promise<AddressConfirmation | null> {
    if (given.length === 0) return null;
    const involved: { step: number; vault: Address; people: VaultPeople }[] = [];
    const seen = new Set<string>();
    const add = async (step: number, a: Address) => {
      const key = a.toLowerCase();
      if (seen.has(key)) return;
      const info = await vaultInfo(a);
      if (!info) return;
      const people = await peopleOf(a, info);
      if (!people.drill) return;
      seen.add(key);
      involved.push({ step, vault: a, people });
    };
    for (const m of made) await add(m.step, m.vault);
    for (const g of given) await add(g.step, g.spender);
    if (involved.length === 0) return null;
    involved.sort((x, y) => x.step - y.step);
    const addresses = involved.flatMap(({ step, vault: v, people }): ConfirmAddress[] => [
      ...people.heirs.map((h, index) => ({
        step,
        vault: v,
        role: 'heir' as const,
        index,
        account: h.account,
        bps: h.bps,
      })),
      ...(people.recoveryEnabled && people.k > 0
        ? people.guardians.map((g, index) => ({
            step,
            vault: v,
            role: 'guardian' as const,
            index,
            account: g,
            bps: null,
          }))
        : []),
    ]);
    return confirmationOf(addresses, opts.confirmed);
  }

  const steps: InspectedStep[] = [];
  const created: { step: number; vault: Address }[] = [];
  const grants: { step: number; spender: Address }[] = [];
  let vault: Address | null = null;
  for (const [index, s] of p.steps.entries()) {
    const parsed = parseBuilderCodeSuffix(s.data);
    const suffix = parsed && validCodes(parsed.codes) ? parsed : null;
    const data = suffix?.data ?? s.data;
    let v: Verdict;
    if (parsed && !suffix) v = { refuse: 'the calldata ends with a builder code suffix that is not valid' };
    else if (!chainOk) v = { refuse: `the link is for chain ${p.chainId}, but this app works on chain ${d.chainId}` };
    else if (s.value !== 0n) v = { refuse: 'the step sends native currency' };
    else if (sameAddress(s.to, d.factory)) v = await factoryCall(data);
    else {
      const info = await vaultInfo(s.to);
      v = info ? await vaultCall(s.to, data, info) : await tokenCall(s.to, data);
    }
    const base = {
      index,
      to: s.to,
      value: s.value,
      builderCodes: suffix?.codes ?? null,
      simulation: SKIPPED,
      create: null,
    };
    if ('refuse' in v) {
      steps.push({ ...base, action: null, summary: null, warnings: [], allowed: false, reason: v.refuse });
    } else {
      vault ??= v.vault ?? null;
      if (v.create) created.push({ step: index, vault: v.create.vault });
      if (v.grant) grants.push({ step: index, spender: v.grant });
      steps.push({
        ...base,
        action: v.action,
        summary: v.summary,
        warnings: v.warnings ?? [],
        allowed: true,
        reason: null,
        create: v.create ?? null,
      });
    }
  }
  const confirm = await drillConfirmation(created, grants);
  if (steps.every((s) => s.allowed)) {
    const sims = await simulateTxs(c, p.from, p.steps);
    sims.forEach((sim, i) => {
      steps[i].simulation = sim;
    });
  }
  return {
    ok: steps.every((s) => s.allowed && s.simulation.ok !== false) && (confirm === null || confirm.confirmed),
    chainId: p.chainId,
    from: p.from,
    vault,
    steps,
    confirm,
  };
}
