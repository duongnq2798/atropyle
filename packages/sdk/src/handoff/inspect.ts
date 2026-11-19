import { type Address, decodeFunctionData, erc20Abi, type Hex, maxUint256, toFunctionSelector } from 'viem';
import { erc1155Abi, factoryAbi, vaultAbi } from '../abi/index';
import { sameAddress, ZERO_ADDRESS } from '../address';
import { isBuilderCode, parseBuilderCodeSuffix } from '../builder-code';
import { AtropyleError } from '../errors';
import { GUARDIAN_WARNING } from '../prepare/actions';
import { approvalForAllWarning, unlimitedApprovalWarning } from '../prepare/approvals';
import { simulateTxs } from '../prepare/simulate';
import { summarize } from '../prepare/summary';
import type { ActionName, Simulation } from '../prepare/types';
import type { ReadContext } from '../read/context';
import { ASSET_KINDS, type Asset, type Warning } from '../types';
import { parsePayloadBytes, payloadBytes, type SignPayload } from './payload';

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
}

export interface SignRequestCheck {
  /** Every step allowed, chain matches, and no simulation failed. */
  ok: boolean;
  chainId: number;
  from: Address;
  vault: Address | null;
  steps: InspectedStep[];
}

interface KnownVault {
  owner: Address;
  assets: Asset[];
}

type Verdict = { action: ActionName; summary: string; vault?: Address; warnings?: Warning[] } | { refuse: string };

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
const SKIPPED: Simulation = { ok: 'skipped', reason: 'NOT_ALLOWED' };

const toAssets = (a: readonly { kind: number; token: Address; id: bigint; heir: number }[]): Asset[] =>
  a.map((x) => ({ kind: ASSET_KINDS[x.kind], token: x.token, id: x.id, heir: x.heir }));

/**
 * The whitelist of spec §15: the factory's createVault; any call to a vault the factory created; approving a fee
 * token to the factory (at most the full fee); approving an asset to a vault owned by the signer (including the one
 * the same link creates). Everything else is refused.
 */
export async function inspectPayload(ctx: ReadContext, request: SignPayload): Promise<SignRequestCheck> {
  const p = normalize(request);
  const d = ctx.deployment;
  const c = ctx.client;
  const chainOk = p.chainId === d.chainId;
  const blockNumber = chainOk ? await c.getBlockNumber() : 0n;
  const known = new Map<string, KnownVault | null>();

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
      info = { owner, assets: toAssets(assets) };
    }
    known.set(key, info);
    return info;
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
    known.set(vault.toLowerCase(), { owner: p.from, assets });
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
      drill,
      heirs: cfg.heirs.map((h) => ({ account: h.account, bps: h.bps })),
      guardians: [...cfg.guardians],
      k: cfg.k,
      recoveryEnabled: cfg.recoveryEnabled,
      timing: { period: cfg.timing.period, threshold: cfg.timing.threshold, window: cfg.timing.window },
      assets,
      fee,
      feeToken: drill ? ZERO_ADDRESS : feeTokenArg,
      feeDecimals,
    });
    return { action: 'createVault', summary, vault };
  }

  function vaultCall(to: Address, data: Hex, info: KnownVault): Verdict {
    let call: ReturnType<typeof decodeFunctionData<typeof vaultAbi>>;
    try {
      call = decodeFunctionData({ abi: vaultAbi, data });
    } catch {
      return { refuse: 'unknown vault call' };
    }
    switch (call.functionName) {
      case 'checkIn':
        return { action: 'checkIn', summary: summarize.checkIn(to), vault: to };
      case 'setHeirs':
        return {
          action: 'setHeirs',
          summary: summarize.setHeirs(
            to,
            call.args[0].map((h) => ({ account: h.account, bps: h.bps })),
          ),
          vault: to,
        };
      case 'setGuardians': {
        const [g, k, recoveryEnabled] = call.args;
        return { action: 'setGuardians', summary: summarize.setGuardians(to, [...g], k, recoveryEnabled), vault: to };
      }
      case 'setTiming': {
        const t = call.args[0];
        return {
          action: 'setTiming',
          summary: summarize.setTiming(to, { period: t.period, threshold: t.threshold, window: t.window }),
          vault: to,
        };
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
          };
        }
        if (sameAddress(spender, ZERO_ADDRESS)) return { action: 'approve', summary: summarize.clear721(to, amount) };
        const v = await signerVault(spender);
        if (typeof v === 'string') return { refuse: v };
        const kind = v.assets.find((a) => sameAddress(a.token, to))?.kind;
        if (kind === 'erc721')
          return { action: 'approve', summary: summarize.approve721(spender, to, amount), vault: spender };
        if (amount === 0n) return { action: 'approve', summary: summarize.revoke20(spender, to), vault: spender };
        if (kind === 'erc20') {
          const decimals = (await ctx.token(to, blockNumber)).decimals;
          return {
            action: 'approve',
            summary: summarize.approve20(spender, to, amount === maxUint256 ? null : amount, decimals),
            vault: spender,
            warnings: amount === maxUint256 ? [unlimitedApprovalWarning(to)] : [],
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
        };
      }
    } catch {
      return { refuse: 'malformed calldata' };
    }
    return { refuse: `unknown call to ${to}` };
  }

  const steps: InspectedStep[] = [];
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
      v = info ? vaultCall(s.to, data, info) : await tokenCall(s.to, data);
    }
    const base = { index, to: s.to, value: s.value, builderCodes: suffix?.codes ?? null, simulation: SKIPPED };
    if ('refuse' in v) {
      steps.push({ ...base, action: null, summary: null, warnings: [], allowed: false, reason: v.refuse });
    } else {
      vault ??= v.vault ?? null;
      steps.push({
        ...base,
        action: v.action,
        summary: v.summary,
        warnings: v.warnings ?? [],
        allowed: true,
        reason: null,
      });
    }
  }
  if (steps.every((s) => s.allowed)) {
    const sims = await simulateTxs(c, p.from, p.steps);
    sims.forEach((sim, i) => {
      steps[i].simulation = sim;
    });
  }
  return {
    ok: steps.every((s) => s.allowed && s.simulation.ok !== false),
    chainId: p.chainId,
    from: p.from,
    vault,
    steps,
  };
}
