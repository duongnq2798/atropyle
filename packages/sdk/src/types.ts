import type { Address } from 'viem';
import { AtropyleError } from './errors';

export type StateName = 'active' | 'grace' | 'recovery' | 'releasedInherit' | 'releasedRecover';

export const STATE_CODES: Record<StateName, number> = {
  active: 0,
  grace: 1,
  recovery: 3,
  releasedInherit: 5,
  releasedRecover: 7,
};

const BY_CODE = new Map<number, StateName>(Object.entries(STATE_CODES).map(([k, v]) => [v, k as StateName]));

export function stateName(code: number): StateName {
  const s = BY_CODE.get(code);
  if (!s) throw new AtropyleError('BAD_POLICY_OUTPUT', { details: { state: code } });
  return s;
}

export function isReleasedState(s: StateName): boolean {
  return s === 'releasedInherit' || s === 'releasedRecover';
}

export const OUT_FLAGS = { alarm: 1, cancel: 2, release: 4 } as const;

export interface Heir {
  account: Address;
  bps: number;
}

export type AssetKind = 'erc20' | 'erc721' | 'erc1155';
/** Index = on-chain `enum Kind`. */
export const ASSET_KINDS: readonly AssetKind[] = ['erc20', 'erc721', 'erc1155'];

export interface Asset {
  kind: AssetKind;
  token: Address;
  /** 0 for ERC-20. */
  id: bigint;
  /** Index into heirs; ERC-20 entries are split by bps and ignore it, but it must still exist. */
  heir: number;
}

export interface Timing {
  /** Seconds between expected check-ins (P). */
  period: number;
  /** Missed periods before the alarm (T). */
  threshold: number;
  /** Alarm window in seconds (W). */
  window: number;
}

/** Mirrors the on-chain `VaultConfig.Config` struct. */
export interface VaultParams {
  heirs: Heir[];
  guardians: Address[];
  k: number;
  recoveryEnabled: boolean;
  timing: Timing;
  assets: Asset[];
}

export interface VaultConfig extends VaultParams {
  owner: Address;
  drill: boolean;
}

export type Role = 'owner' | 'heir' | 'guardian' | 'recoveryTarget';

export type WarningCode =
  | 'COVERAGE_BELOW_100'
  | 'UNLIMITED_APPROVAL'
  | 'APPROVAL_FOR_ALL'
  | 'GUARDIAN_VERIFY_OUT_OF_BAND'
  | 'DRILL_NOT_FOR_REAL_ASSETS'
  | 'NO_GUARDIANS'
  | 'HEIR_IS_CONTRACT'
  | 'TOKEN_NOT_HELD'
  | 'SINGLE_RPC'
  | 'NO_EFFECT';

export interface Warning {
  code: WarningCode;
  message: string;
}
