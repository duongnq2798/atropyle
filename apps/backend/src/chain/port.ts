import type { AssetKind, IntegrityReport, KeeperReport, ScanResult, StateName } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { Role } from '../types';

/** An asset of the vault as the payout email needs it. `id` is a decimal string (0 for ERC-20). */
export interface StoredAsset {
  index: number;
  kind: AssetKind;
  token: Address;
  id: string;
  decimals: number | null;
}

/** What the database keeps of a vault: one snapshot at the latest block, plus the keeper's next look. */
export interface VaultView {
  vault: Address;
  owner: Address;
  drill: boolean;
  state: StateName;
  pending: StateName;
  lastAlive: bigint;
  lateAt: bigint;
  windowEndsAt: bigint | null;
  recoveryTarget: Address | null;
  expiresAt: bigint | null;
  expired: boolean;
  released: boolean;
  /** Chain time at which the keeper should look again (now when an action is due); null when never. */
  nextCheckAt: bigint | null;
  roles: { address: Address; role: Role }[];
  assets: StoredAsset[];
  blockNumber: bigint;
  blockTimestamp: bigint;
}

export interface ChainHead {
  number: bigint;
  timestamp: bigint;
}

export interface ScanRequest {
  /** The stored cursor and every vault indexed so far. */
  resume: { toBlock: bigint; vaults: Address[] };
  toBlock: bigint;
}

export interface KeeperRun {
  vaults: Address[];
  maxTx: number;
  /** Chain time of the last distribute this keeper sent, per vault (checksummed). */
  lastDistributeAt: ReadonlyMap<Address, bigint>;
}

/** Everything the backend asks of the chain. createSdkChain is the real one; FakeChain backs the unit tests. */
export interface ChainPort {
  readonly factoryBlock: bigint;
  head(): Promise<ChainHead>;
  scan(o: ScanRequest): Promise<ScanResult>;
  blockTime(block: bigint): Promise<bigint>;
  view(vault: Address): Promise<VaultView>;
  /** factory.isVault: only vaults of this deployment can be subscribed to. */
  isVault(vault: Address): Promise<boolean>;
  keeper(run: KeeperRun): Promise<KeeperReport>;
  integrity(): Promise<IntegrityReport>;
}
