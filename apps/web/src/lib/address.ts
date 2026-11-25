/** Copy of sameAddress in packages/sdk/src/address.ts (Quyết định 13). */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** Shape only: 0x and 40 hex digits. Checksums are the SDK's job (`toAddress`), loaded lazily. */
export function isAddressText(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

/** `0x` then ten groups of four, so two addresses can be compared group by group (spec §4.2). */
export function addressGroups(address: string): string[] {
  if (!isAddressText(address)) return [address];
  const body = address.slice(2);
  return ['0x', ...Array.from({ length: 10 }, (_, i) => body.slice(i * 4, i * 4 + 4))];
}

/**
 * Only for the connected account in the header, where the full address is one click away. Every address the user
 * must check (recipients, heirs, guardians, vaults) is shown in full with <Address>.
 */
export function compactAddress(address: string): string {
  const g = addressGroups(address);
  if (g.length === 1) return address;
  return `0x${g[1]} ${g[2]} … ${g[9]} ${g[10]}`;
}
