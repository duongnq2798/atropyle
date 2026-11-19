import type { Address } from 'viem';
import type { AssetKind, Timing, VaultParams, Warning } from '../types';

export type PresetName = 'drill' | 'sixMonths' | 'twelveMonths';

/** Spec core §6 names the presets; plan decision 7 fixes the numbers. */
export const PRESETS: Record<PresetName, Timing> = {
  drill: { period: 60, threshold: 2, window: 120 },
  sixMonths: { period: 30 * 86400, threshold: 6, window: 14 * 86400 },
  twelveMonths: { period: 30 * 86400, threshold: 12, window: 30 * 86400 },
};

/** The limits of `contracts/src/vault/VaultConfig.sol`. */
export const LIMITS = {
  maxHeirs: 5,
  maxGuardians: 5,
  maxAssets: 20,
  bps: 10_000,
  minPeriod: 86_400,
  minWindow: 259_200,
  drillMin: 60,
  maxThreshold: 15,
  maxUint32: 4_294_967_295,
} as const;

export interface HeirInput {
  account: string;
  bps?: number;
  percent?: number;
}

export type TimingInput = PresetName | { period: number | string; threshold: number; window: number | string };

export interface AssetInput {
  kind: AssetKind;
  token: string;
  id?: string | number;
  heir?: number;
}

/** The `atropyle.plan.json` format. */
export interface PlanInput {
  version?: 1;
  owner?: string;
  drill?: boolean;
  heirs: HeirInput[];
  guardians?: string[];
  k?: number;
  recoveryEnabled?: boolean;
  timing: TimingInput;
  assets?: AssetInput[];
}

export type PlanIssueCode =
  | 'REQUIRED'
  | 'TYPE'
  | 'UNKNOWN_FIELD'
  | 'INVALID_ADDRESS'
  | 'ZERO_ADDRESS'
  | 'DUPLICATE'
  | 'HEIRS_COUNT'
  | 'HEIR_IS_OWNER'
  | 'HEIR_IS_VAULT'
  | 'SHARE_FORMAT'
  | 'SHARE_ZERO'
  | 'SHARES_SUM'
  | 'GUARDIANS_COUNT'
  | 'GUARDIAN_IS_OWNER'
  | 'GUARDIAN_IS_VAULT'
  | 'K_RANGE'
  | 'RECOVERY_NEEDS_K'
  | 'UNKNOWN_PRESET'
  | 'PERIOD_MIN'
  | 'WINDOW_MIN'
  | 'THRESHOLD_RANGE'
  | 'DURATION_MAX'
  | 'ASSETS_COUNT'
  | 'ASSET_KIND'
  | 'ERC20_ID_NONZERO'
  | 'ASSET_HEIR_RANGE'
  | 'TOKEN_NOT_CONTRACT';

export interface PlanIssue {
  path: string;
  code: PlanIssueCode;
  message: string;
}

export interface PlanConfig extends VaultParams {
  owner: Address | null;
  drill: boolean;
}

export type PlanResult = { ok: true; config: PlanConfig; warnings: Warning[] } | { ok: false; issues: PlanIssue[] };

export interface SectionContext {
  owner: Address;
  /** The vault being edited: the contract rejects it as an heir or a guardian (address(this)). */
  vault?: Address;
  heirCount: number;
  k?: number;
  recoveryEnabled?: boolean;
}

export interface GuardianPart {
  guardians: Address[];
  k: number;
  recoveryEnabled: boolean;
}

export type SectionResult<T> = { issues: PlanIssue[]; value: T | null };
