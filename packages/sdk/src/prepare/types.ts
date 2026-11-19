import type { Address, Hex } from 'viem';
import type { VaultActionType } from '../actions';
import type { AtropyleErrorJson } from '../errors';
import type { PolicyEngine } from '../policy/engine';
import type { WhatIfResult } from '../policy/predict';
import type { ReadContext } from '../read/context';
import type { Warning } from '../types';

export type ActionName = VaultActionType | 'createVault' | 'approve' | 'setApprovalForAll';
export type SkipReason = 'DEPENDS_ON_PREVIOUS_STEP' | 'FUTURE_TIME' | 'NOT_ALLOWED';

export type Simulation =
  | { ok: true; gas: bigint }
  | { ok: false; error: AtropyleErrorJson }
  | { ok: 'skipped'; reason: SkipReason };

/** Plain, JSON-serializable data (spec §5.2): CLI and MCP return it as is. */
export interface PreparedTx {
  chainId: number;
  /** The account that must sign. */
  from: Address;
  to: Address;
  /** Includes the ERC-8021 builder code suffix when one is configured. */
  data: Hex;
  value: bigint;
  action: ActionName;
  /** One English sentence built only from typed data; never contains untrusted text. */
  summary: string;
  warnings: Warning[];
  simulation: Simulation;
  effect?: WhatIfResult;
}

export interface TxPlan {
  chainId: number;
  from: Address;
  /** The vault the plan acts on (predicted address for createVault). */
  vault: Address;
  steps: PreparedTx[];
  summary: string;
  warnings: Warning[];
}

export type AllowanceMode = 'exact' | 'unlimited';

export interface PrepareOptions {
  as: string;
  allowance?: AllowanceMode;
  /** Time for the predicted effect; defaults to the snapshot block timestamp. */
  at?: bigint;
}

export interface CreateVaultOptions {
  owner: string;
  drill?: boolean;
  feeToken?: string;
  salt?: Hex;
  allowance?: AllowanceMode;
}

export interface WhatIfReport {
  action: VaultActionType;
  as: Address;
  effect: WhatIfResult | null;
  simulation: Simulation;
}

export interface Draft {
  to: Address;
  data: Hex;
  value: bigint;
  action: ActionName;
  summary: string;
  warnings: Warning[];
  effect?: WhatIfResult;
}

export interface PrepareContext extends ReadContext {
  suffix: Hex | null;
  engineFor(cpu: Address, policyId: bigint): Promise<PolicyEngine>;
}
