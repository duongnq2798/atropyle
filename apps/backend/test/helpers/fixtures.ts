import {
  type CreatedVault,
  untrusted,
  type VaultConfig,
  type VaultEvent,
  type VaultSnapshot,
  type VaultStatus,
} from '@atropyle/sdk';
import { type Address, getAddress, type Hex } from 'viem';
import type { VaultView } from '../../src/chain/port';

/** Chain time of the fake chain's head block (FakeChain.headTime). */
export const T0 = 1_800_000_000n;

export const addr = (n: number): Address => getAddress(`0x${n.toString(16).padStart(40, '0')}`);
export const txh = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;

export const OWNER = addr(0x1001);
export const HEIR = addr(0x2002);
export const GUARDIAN = addr(0x3003);
export const TARGET = addr(0x5005);
export const TOKEN = addr(0x4004);
export const VAULT = addr(0xa001);
export const VAULT2 = addr(0xa002);

/** An active Drill vault seen at T0 (period 60 s, threshold 2: late 120 s after the last check-in). */
export function view(over: Partial<VaultView> = {}): VaultView {
  return {
    vault: VAULT,
    owner: OWNER,
    drill: true,
    state: 'active',
    pending: 'active',
    lastAlive: T0 - 10n,
    lateAt: T0 + 110n,
    windowEndsAt: null,
    recoveryTarget: null,
    expiresAt: T0 + 604_790n,
    expired: false,
    released: false,
    nextCheckAt: T0 + 110n,
    roles: [
      { address: OWNER, role: 'owner' },
      { address: HEIR, role: 'heir' },
      { address: GUARDIAN, role: 'guardian' },
    ],
    assets: [{ index: 0, kind: 'erc20', token: TOKEN, id: '0', decimals: 6 }],
    blockNumber: 200n,
    blockTimestamp: T0,
    ...over,
  };
}

export function created(over: Partial<CreatedVault> = {}): CreatedVault {
  return { vault: VAULT, owner: OWNER, drill: true, blockNumber: 150n, transactionHash: txh(1), ...over };
}

export function vaultEvent(name: string, args: Record<string, unknown>, over: Partial<VaultEvent> = {}): VaultEvent {
  return { address: VAULT, name, args, blockNumber: 150n, logIndex: 0, transactionHash: txh(1), ...over };
}

/** A real-shaped SDK snapshot of an active Drill with one ERC-20 asset, at T0. */
export function snapshotFixture(
  over: { status?: Partial<VaultStatus>; config?: Partial<VaultConfig> } = {},
): VaultSnapshot {
  const config: VaultConfig = {
    owner: OWNER,
    drill: true,
    heirs: [{ account: HEIR, bps: 10_000 }],
    guardians: [],
    k: 0,
    recoveryEnabled: false,
    timing: { period: 60, threshold: 2, window: 120 },
    assets: [{ kind: 'erc20', token: TOKEN, id: 0n, heir: 0 }],
    ...over.config,
  };
  const status: VaultStatus = {
    vault: VAULT,
    chainId: 196,
    blockNumber: 200n,
    blockTimestamp: T0,
    state: 'active',
    stateCode: 0,
    pending: 'active',
    pendingCode: 0,
    idle: 0,
    lastAlive: T0,
    lateAt: T0 + 120n,
    alarmAt: null,
    windowEndsAt: null,
    releasedAt: null,
    expiresAt: T0 + 604_800n,
    expired: false,
    inhVotes: 0,
    inhVoters: [],
    recoveryTarget: null,
    recVotes: [],
    assets: [
      {
        index: 0,
        asset: { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 },
        token: { address: TOKEN, symbol: untrusted('USDT0'), name: untrusted('USDT0'), decimals: 6 },
        coverage: 10_000_000_000n,
        held: 10_000_000_000n,
      },
    ],
    ...over.status,
  };
  return { config, status, binding: { factory: addr(0xf00), cpu: addr(0xc00), policyId: 1n } };
}
