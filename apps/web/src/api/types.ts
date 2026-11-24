import type { Address } from 'viem';

/**
 * The contract of spec §9.6, the only interface between this app and the backend (Plan 8). Change the spec first.
 * Wire types: bigint values are decimal strings, times are ISO 8601 UTC strings, addresses are checksummed.
 */
export type Role = 'owner' | 'guardian' | 'heir';
export type Lang = 'en' | 'vi';

export const PROBLEM_CODES = [
  'INVALID_INPUT',
  'NOT_A_VAULT',
  'RATE_LIMITED',
  'TOKEN_INVALID',
  'UNAUTHORIZED',
  'INTERNAL',
] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];

/** An error answer, served as `application/problem+json`. */
export interface Problem {
  type: 'about:blank';
  title: string;
  status: number;
  code: ProblemCode;
}

export interface SubscribeRequest {
  email: string;
  vault: Address;
  role: Role;
  lang: Lang;
  /** A trap for bots: a person never sees the field, so it is always empty. */
  website: string;
}

export interface OkResponse {
  ok: true;
}

export interface ConfirmResponse {
  ok: true;
  vault: Address;
  role: Role;
}

export interface MeVault {
  vault: Address;
  roles: Role[];
  drill: boolean;
  /** The SDK's state name (`active`, `grace`, …): shown as data, never as markup. */
  state: string;
  released: boolean;
}

export interface MeResponse {
  address: Address;
  block: string;
  vaults: MeVault[];
}

export interface StatsResponse {
  block: string;
  vaults: string;
  drills: string;
  checkIns: string;
  updatedAt: string;
}

export interface HealthResponse {
  indexer: { block: string; lagBlocks: number; updatedAt: string };
  /** null until the first integrity run. */
  integrity: { at: string; block: string; ok: boolean } | null;
  /** null until the keeper's first run. */
  keeper: { lastRunAt: string; balanceWei: string; dryRun: boolean } | null;
}
