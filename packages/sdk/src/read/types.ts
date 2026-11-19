import type { Address } from 'viem';
import type { Asset, StateName, VaultConfig } from '../types';
import type { Untrusted } from '../untrusted';

export interface TokenInfo {
  address: Address;
  symbol: Untrusted;
  name: Untrusted;
  /** null when the token has no decimals() (ERC-721, ERC-1155, or a non-standard ERC-20). */
  decimals: number | null;
}

export interface AssetStatus {
  index: number;
  asset: Asset;
  token: TokenInfo;
  /** What distribute() could move right now (on-chain coverage()). */
  coverage: bigint;
  /** What the owner holds: ERC-20 balance, ERC-721 1/0, ERC-1155 balance. */
  held: bigint;
}

export interface VaultStatus {
  vault: Address;
  chainId: number;
  blockNumber: bigint;
  /** "Now" for every derived value: the timestamp of blockNumber, never the local clock. */
  blockTimestamp: bigint;
  state: StateName;
  stateCode: number;
  /**
   * State a poke() from anyone but the owner would produce at this block (computed on chain); equals state once
   * released or after a Drill expired. An owner-signed poke is a check-in instead.
   */
  pending: StateName;
  pendingCode: number;
  idle: number;
  lastAlive: bigint;
  lateAt: bigint;
  alarmAt: bigint | null;
  windowEndsAt: bigint | null;
  releasedAt: bigint | null;
  expiresAt: bigint | null;
  expired: boolean;
  inhVotes: number;
  inhVoters: Address[];
  recoveryTarget: Address | null;
  recVotes: { guardian: Address; target: Address | null }[];
  assets: AssetStatus[];
}

export interface VaultBinding {
  factory: Address;
  cpu: Address;
  policyId: bigint;
}

export interface VaultSnapshot {
  config: VaultConfig;
  status: VaultStatus;
  binding: VaultBinding;
}
