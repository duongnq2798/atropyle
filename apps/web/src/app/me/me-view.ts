import type { Role } from '@atropyle/sdk';
import type { MyVault, MyVaults } from '@/chain/impl/my-vaults';

export type Section = 'own' | 'guard' | 'inherit';
export const SECTIONS: readonly Section[] = ['own', 'guard', 'inherit'];

/**
 * The roles the factory indexes: AtropyleVault indexes its owner, its heirs and its guardians, never a recovery
 * target, so readVaultsOf never returns 'recoveryTarget' (packages/sdk/src/read/vaults.ts).
 */
export type ListRole = Exclude<Role, 'recoveryTarget'>;
export const SECTION_ROLE: Record<Section, ListRole> = { own: 'owner', guard: 'guardian', inherit: 'heir' };

/** Spec §5.6: one list per role. A vault where the wallet has two roles is in both lists, in the chain's order. */
export function sectionsOf(vaults: readonly MyVault[]): Record<Section, MyVault[]> {
  const out: Record<Section, MyVault[]> = { own: [], guard: [], inherit: [] };
  for (const v of vaults) {
    for (const s of SECTIONS) if (v.roles.includes(SECTION_ROLE[s])) out[s].push(v);
  }
  return out;
}

/** The wallet's roles in a vault other than the one its list stands for, in list order. */
export function otherRoles(roles: readonly Role[], section: Section): ListRole[] {
  return SECTIONS.filter((s) => s !== section && roles.includes(SECTION_ROLE[s])).map((s) => SECTION_ROLE[s]);
}

/** The factory index only grows and anyone can add to it, so the newest `limit` entries may leave a vault out. */
export function truncated(d: Pick<MyVaults, 'indexed' | 'limit'>): boolean {
  return d.indexed > BigInt(d.limit);
}

/** `atropyle vaults <account>` of packages/cli, unpinned like COMMANDS.verify (me-view.test.ts ties both). */
export const CLI_VAULTS = 'npx -y atropyle vaults';

export function vaultsCommand(account: string | null): string {
  return `${CLI_VAULTS} ${account ?? '<address>'}`;
}
