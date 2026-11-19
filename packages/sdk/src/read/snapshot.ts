import { type Address, erc20Abi, erc721Abi, type PublicClient } from 'viem';
import { erc1155Abi, vaultAbi } from '../abi/index';
import { sameAddress, toAddress, ZERO_ADDRESS } from '../address';
import { AtropyleError, decodeError, isContractAnswer } from '../errors';
import { ASSET_KINDS, type Asset, type Role, stateName, type VaultConfig } from '../types';
import type { ReadContext } from './context';
import type { VaultSnapshot, VaultStatus } from './types';

const orNull = (a: Address): Address | null => (a === ZERO_ADDRESS ? null : a);
const big = (x: bigint): bigint | null => (x === 0n ? null : x);

/**
 * What the owner holds of one asset at `blockNumber`. A token that answers with a revert or nothing reads as 0. Any
 * other failure (a throttled or lagging RPC, a malformed response) is rethrown: it must not be mistaken for an empty
 * balance.
 */
export async function heldBy(c: PublicClient, owner: Address, a: Asset, blockNumber: bigint): Promise<bigint> {
  try {
    if (a.kind === 'erc20') {
      return await c.readContract({
        address: a.token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
        blockNumber,
      });
    }
    if (a.kind === 'erc721') {
      const holder = await c.readContract({
        address: a.token,
        abi: erc721Abi,
        functionName: 'ownerOf',
        args: [a.id],
        blockNumber,
      });
      return sameAddress(holder, owner) ? 1n : 0n;
    }
    return await c.readContract({
      address: a.token,
      abi: erc1155Abi,
      functionName: 'balanceOf',
      args: [owner, a.id],
      blockNumber,
    });
  } catch (e) {
    if (isContractAnswer(e)) return 0n;
    throw decodeError(e);
  }
}

// One function, so viem infers the type of every element (heirs is a readonly { account; bps }[], and so on).
// Do not replace it with a generic helper taking `functionName: string`: that loses the types.
function readVaultState(c: PublicClient, vault: Address, blockNumber: bigint) {
  const at = { address: vault, abi: vaultAbi, blockNumber } as const;
  return Promise.all([
    c.readContract({ ...at, functionName: 'owner' }),
    c.readContract({ ...at, functionName: 'drill' }),
    c.readContract({ ...at, functionName: 'k' }),
    c.readContract({ ...at, functionName: 'recoveryEnabled' }),
    c.readContract({ ...at, functionName: 'heirs' }),
    c.readContract({ ...at, functionName: 'guardians' }),
    c.readContract({ ...at, functionName: 'assets' }),
    c.readContract({ ...at, functionName: 'timing' }),
    c.readContract({ ...at, functionName: 'status' }),
    c.readContract({ ...at, functionName: 'factory' }),
    c.readContract({ ...at, functionName: 'cpu' }),
    c.readContract({ ...at, functionName: 'policyId' }),
  ]);
}

/** Every read uses the same block, and "now" is that block's timestamp (Review Focus 1). */
export async function readSnapshot(ctx: ReadContext, vault: Address, blockNumber?: bigint): Promise<VaultSnapshot> {
  const c = ctx.client;
  const t0 = Date.now();
  const bn = blockNumber ?? (await c.getBlockNumber());
  const [block, code] = await Promise.all([
    c.getBlock({ blockNumber: bn }),
    c.getCode({ address: vault, blockNumber: bn }),
  ]);
  if (!code || code === '0x') {
    throw new AtropyleError('NOT_VAULT', { message: `${vault} has no contract code.`, details: { vault } });
  }
  let raw: Awaited<ReturnType<typeof readVaultState>>;
  try {
    raw = await readVaultState(c, vault, bn);
  } catch (e) {
    // Only the contract's own answer (a revert, no data, undecodable data) means "not a vault"; a failing RPC does not.
    if (!isContractAnswer(e)) throw decodeError(e);
    throw new AtropyleError('NOT_VAULT', {
      message: `${vault} does not answer like an Atropyle vault.`,
      cause: e,
      details: { vault },
    });
  }
  const [owner, drill, k, recoveryEnabled, heirs, guardians, assets, timing, st, factory, cpu, policyId] = raw;
  const config: VaultConfig = {
    owner,
    drill,
    heirs: heirs.map((h) => ({ account: h.account, bps: h.bps })),
    guardians: [...guardians],
    k,
    recoveryEnabled,
    timing: { period: timing.period, threshold: timing.threshold, window: timing.window },
    assets: assets.map((a) => ({ kind: ASSET_KINDS[a.kind], token: a.token, id: a.id, heir: a.heir })),
  };
  const [tokens, held] = await Promise.all([
    Promise.all(config.assets.map((a) => ctx.token(a.token, bn))),
    Promise.all(config.assets.map((a) => heldBy(c, owner, a, bn))),
  ]);
  const status: VaultStatus = {
    vault,
    chainId: ctx.deployment.chainId,
    blockNumber: bn,
    blockTimestamp: block.timestamp,
    state: stateName(st.state),
    stateCode: st.state,
    pending: stateName(st.pending),
    pendingCode: st.pending,
    idle: st.idle,
    lastAlive: st.lastAlive,
    lateAt: st.lateAt,
    alarmAt: big(st.alarmAt),
    windowEndsAt: big(st.windowEndsAt),
    releasedAt: big(st.releasedAt),
    expiresAt: big(st.expiresAt),
    expired: st.expiresAt !== 0n && block.timestamp >= st.expiresAt,
    inhVotes: st.inhVotes,
    inhVoters: config.guardians.filter((_, i) => ((st.inhVotes >> i) & 1) === 1),
    recoveryTarget: orNull(st.recoveryTarget),
    recVotes: config.guardians.map((guardian, i) => ({ guardian, target: orNull(st.recVotes[i] ?? ZERO_ADDRESS) })),
    assets: config.assets.map((asset, i) => ({
      index: i,
      asset,
      token: tokens[i],
      coverage: st.coverage[i] ?? 0n,
      held: held[i],
    })),
  };
  ctx.log({ type: 'read', what: `snapshot ${vault}`, ms: Date.now() - t0, blockNumber: bn });
  return { config, status, binding: { factory, cpu, policyId } };
}

export function rolesOf(snap: VaultSnapshot, account: string): Role[] {
  const a = toAddress(account, 'account');
  const roles: Role[] = [];
  if (sameAddress(snap.config.owner, a)) roles.push('owner');
  if (snap.config.heirs.some((h) => sameAddress(h.account, a))) roles.push('heir');
  if (snap.config.guardians.some((g) => sameAddress(g, a))) roles.push('guardian');
  if (sameAddress(snap.status.recoveryTarget, a)) roles.push('recoveryTarget');
  return roles;
}
