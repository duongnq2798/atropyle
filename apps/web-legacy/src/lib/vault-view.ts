import {
  type AssetKind,
  decodeError,
  isReleasedState,
  type PlanIssue,
  planTemplate,
  type Role,
  rolesOf,
  type StateName,
  sameAddress,
  type Timeline,
  type TimelineEvent,
  type TokenInfo,
  type VaultAction,
  type VaultConfig,
  type VaultSnapshot,
} from '@atropyle/sdk';
import type { Address } from 'viem';
import { assetRows, assetsInput, type HeirRow } from './create-form';
import { coveragePercent } from './format';

export interface AssetView {
  index: number;
  kind: AssetKind;
  token: Address;
  id: bigint;
  heir: number;
  /** The heir an NFT goes to; null for an ERC-20, which is split by the heirs' shares. */
  recipient: Address | null;
  info: TokenInfo;
  held: bigint;
  coverage: bigint;
  /** null: the owner holds none of it right now. */
  percent: number | null;
}

export interface VaultView {
  vault: Address;
  owner: Address;
  drill: boolean;
  state: StateName;
  released: boolean;
  expired: boolean;
  roles: Role[];
  lastAlive: bigint;
  blockNumber: bigint;
  next: TimelineEvent | null;
  assets: AssetView[];
  lowCoverage: number[];
}

export function vaultView(snap: VaultSnapshot, timeline: Timeline, account: string | null): VaultView {
  const s = snap.status;
  const assets = s.assets.map(
    (a): AssetView => ({
      index: a.index,
      kind: a.asset.kind,
      token: a.asset.token,
      id: a.asset.id,
      heir: a.asset.heir,
      recipient: a.asset.kind === 'erc20' ? null : (snap.config.heirs[a.asset.heir]?.account ?? null),
      info: a.token,
      held: a.held,
      coverage: a.coverage,
      percent: coveragePercent(a.coverage, a.held),
    }),
  );
  return {
    vault: s.vault,
    owner: snap.config.owner,
    drill: snap.config.drill,
    state: s.state,
    released: isReleasedState(s.state),
    expired: s.expired,
    roles: account ? rolesOf(snap, account) : [],
    lastAlive: s.lastAlive,
    blockNumber: s.blockNumber,
    next: timeline.events[0] ?? null,
    assets,
    lowCoverage: assets.filter((a) => a.percent !== null && a.percent < 100).map((a) => a.index),
  };
}

export interface NftRemap {
  index: number;
  kind: AssetKind;
  token: Address;
  id: bigint;
  info: TokenInfo;
  heir: number;
  from: Address;
  /** What the owner typed at that position, trimmed; null when the edited list has no heir there. */
  to: string | null;
}

/**
 * An NFT names an heir by position, not by address. These NFTs would go to someone else (or to no heir) if the edited
 * heir list were saved as it is.
 */
export function nftRemaps(snap: VaultSnapshot, rows: readonly HeirRow[]): NftRemap[] {
  const heirs = snap.config.heirs;
  return snap.status.assets.flatMap((a): NftRemap[] => {
    if (a.asset.kind === 'erc20') return [];
    const from = heirs[a.asset.heir]?.account;
    if (!from) return [];
    const row = rows[a.asset.heir];
    const to = row ? row.account.trim() : null;
    if (to !== null && sameAddress(from, to)) return [];
    const { kind, token, id, heir } = a.asset;
    return [{ index: a.index, kind, token, id, info: a.token, heir, from, to }];
  });
}

/** Empty k means the SDK's default majority; no guardians means nothing to confirm and no recovery. */
export function guardiansAction(guardians: readonly string[], k: string, recoveryEnabled: boolean): VaultAction {
  const list = guardians.map((g) => g.trim());
  if (list.length === 0) return { type: 'setGuardians', guardians: [], k: 0, recoveryEnabled: false };
  const kk = k.trim() === '' ? (planTemplate('guarded', { heirs: [], guardians: list }).k ?? 0) : Number(k.trim());
  return { type: 'setGuardians', guardians: list, k: kk, recoveryEnabled };
}

/** The SDK's COVERAGE_BELOW_100 advice: set the same assets again, which approves what is missing. */
export function fixCoverageAction(c: VaultConfig): VaultAction {
  return { type: 'setAssets', assets: assetsInput(assetRows(c.assets)) };
}

const isIssue = (x: unknown): x is PlanIssue =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as PlanIssue).path === 'string' &&
  typeof (x as PlanIssue).code === 'string' &&
  typeof (x as PlanIssue).message === 'string';

export function planIssues(e: unknown): PlanIssue[] {
  const err = decodeError(e);
  if (err.code !== 'PLAN_INVALID') return [];
  const list = err.details?.issues;
  return Array.isArray(list) ? list.filter(isIssue) : [];
}
