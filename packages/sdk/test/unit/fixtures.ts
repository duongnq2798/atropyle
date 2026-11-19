import type { Address } from 'viem';
import { STATE_CODES, type StateName, untrusted, type VaultSnapshot } from '../../src/index';

export const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
export const HEIR_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
export const HEIR_B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;
export const G1 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as Address;
export const G2 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as Address;
export const G3 = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as Address;
export const NEW_WALLET = '0x976EA74026E726554dB657fA54763abd0C3a0aa9' as Address;
export const VAULT = '0x1111111111111111111111111111111111111111' as Address;
export const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;
export const NFT = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address;

export const DAY = 86400n;

export interface SnapOptions {
  state?: StateName;
  pending?: StateName;
  now?: bigint;
  lastAlive?: bigint;
  alarmAt?: bigint | null;
  k?: number;
  recoveryEnabled?: boolean;
  timing?: { period: number; threshold: number; window: number };
  inhVotes?: number;
  recVotes?: (Address | null)[];
  recoveryTarget?: Address | null;
  drill?: boolean;
  expiresAt?: bigint | null;
  coverage?: [bigint, bigint];
  owner?: Address;
}

/** Guarded vault: heirs A 60% / B 40%, guardians G1-G3, assets [ERC-20 split, NFT #1 → B]. */
export function makeSnapshot(o: SnapOptions = {}): VaultSnapshot {
  const timing = o.timing ?? { period: 86400, threshold: 3, window: 3 * 86400 };
  const state = o.state ?? 'active';
  const lastAlive = o.lastAlive ?? 0n;
  const alarmAt = o.alarmAt ?? null;
  const expiresAt = o.expiresAt ?? null;
  const now = o.now ?? 10n;
  const guardians = [G1, G2, G3];
  const recVotes = o.recVotes ?? [null, null, null];
  const inhVotes = o.inhVotes ?? 0;
  const coverage = o.coverage ?? [1_000_001n, 1n];
  return {
    binding: { factory: VAULT, cpu: VAULT, policyId: 1n },
    config: {
      owner: o.owner ?? OWNER,
      drill: o.drill ?? false,
      heirs: [
        { account: HEIR_A, bps: 6000 },
        { account: HEIR_B, bps: 4000 },
      ],
      guardians,
      k: o.k ?? 2,
      recoveryEnabled: o.recoveryEnabled ?? true,
      timing,
      assets: [
        { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 },
        { kind: 'erc721', token: NFT, id: 1n, heir: 1 },
      ],
    },
    status: {
      vault: VAULT,
      chainId: 31337,
      blockNumber: 100n,
      blockTimestamp: now,
      state,
      stateCode: STATE_CODES[state],
      pending: o.pending ?? state,
      pendingCode: STATE_CODES[o.pending ?? state],
      idle: 0,
      lastAlive,
      lateAt: lastAlive + BigInt(timing.threshold * timing.period),
      alarmAt,
      windowEndsAt: alarmAt === null ? null : alarmAt + BigInt(timing.window),
      releasedAt: null,
      expiresAt,
      expired: expiresAt !== null && now >= expiresAt,
      inhVotes,
      inhVoters: guardians.filter((_, i) => (inhVotes >> i) & 1),
      recoveryTarget: o.recoveryTarget ?? null,
      recVotes: guardians.map((guardian, i) => ({ guardian, target: recVotes[i] })),
      assets: [
        {
          index: 0,
          asset: { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 },
          token: { address: TOKEN, symbol: untrusted('USDT0'), name: untrusted('USDT0'), decimals: 6 },
          coverage: coverage[0],
          held: coverage[0],
        },
        {
          index: 1,
          asset: { kind: 'erc721', token: NFT, id: 1n, heir: 1 },
          token: { address: NFT, symbol: untrusted('MNFT'), name: untrusted('Mock NFT'), decimals: null },
          coverage: coverage[1],
          held: 1n,
        },
      ],
    },
  };
}
