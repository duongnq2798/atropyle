import type { VaultSnapshot } from '@atropyle/sdk';
import { isAddressText, sameAddress } from '@/lib/address';

type VaultConfig = VaultSnapshot['config'];

export type InviteRole = 'guardian' | 'heir';
export type InviteProblem = 'missing' | 'shape' | 'address' | 'role';
export type Invite = { ok: true; vault: `0x${string}`; role: InviteRole } | { ok: false; reason: InviteProblem };

/** 42 for the address, 1 for the dot, 8 for the longest role ("guardian"): anything longer was padded. */
const MAX = 51;

/**
 * `#<vault>.<role>` as joinHref writes it: the shape and the role. The EIP-55 checksum of a mixed-case address is
 * checked by the SDK's toAddress at the start of the read (use-invited-vault.ts), before any request reaches a node,
 * so viem stays out of this page's first load (Decision 13).
 */
export function parseInvite(hash: string): Invite {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') return { ok: false, reason: 'missing' };
  const parts = raw.split('.');
  if (raw.length > MAX || parts.length !== 2) return { ok: false, reason: 'shape' };
  const [address, role] = parts;
  if (!isAddressText(address)) return { ok: false, reason: 'address' };
  if (role !== 'guardian' && role !== 'heir') return { ok: false, reason: 'role' };
  return { ok: true, vault: address as `0x${string}`, role };
}

export type NamedRole = 'owner' | 'guardian' | 'heir';

/** The roles `account` holds in the vault's own lists, in this order; [] without an account. */
export function namedRoles(
  config: Pick<VaultConfig, 'owner' | 'heirs' | 'guardians'>,
  account: string | null,
): NamedRole[] {
  if (!account) return [];
  const out: NamedRole[] = [];
  if (sameAddress(config.owner, account)) out.push('owner');
  if (config.guardians.some((g) => sameAddress(g, account))) out.push('guardian');
  if (config.heirs.some((h) => sameAddress(h.account, account))) out.push('heir');
  return out;
}

/** The index of `account` among the heirs (its branch of the thread), or -1. */
export function heirIndex(config: Pick<VaultConfig, 'heirs'>, account: string | null): number {
  return account ? config.heirs.findIndex((h) => sameAddress(h.account, account)) : -1;
}

export type WalletMatch = 'yes' | 'other' | 'no';

/** `yes`: named in the role of the link; `other`: named, in another role; `no`: not named at all. */
export function walletMatch(roles: readonly NamedRole[], role: InviteRole): WalletMatch {
  if (roles.includes(role)) return 'yes';
  return roles.length > 0 ? 'other' : 'no';
}
