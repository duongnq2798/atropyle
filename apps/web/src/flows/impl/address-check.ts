import { type Address, getAddress, isAddress } from 'viem';

/** What is wrong with a typed address. Empty input is not an issue here: the plan check names a missing address. */
export type AddressIssue = 'invalid' | 'checksum' | 'zero';

export function addressIssue(text: string): AddressIssue | null {
  const s = text.trim();
  if (s === '') return null;
  if (!isAddress(s, { strict: false })) return 'invalid';
  // Mixed case must carry a valid EIP-55 checksum: it catches most one-character typos (all-lowercase passes).
  if (!isAddress(s)) return 'checksum';
  if (/^0x0{40}$/i.test(s)) return 'zero';
  return null;
}

/** Rows whose address repeats an earlier row's, compared without case; blank rows never count. */
export function duplicateIndexes(list: readonly string[]): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  list.forEach((raw, i) => {
    const key = raw.trim().toLowerCase();
    if (key === '') return;
    if (seen.has(key)) out.push(i);
    else seen.add(key);
  });
  return out;
}

/**
 * The checksummed form of what it can read, else null. It also "corrects" a broken checksum (viem's getAddress), so
 * call addressIssue first: a typed address with a wrong checksum is a typo to show, not a value to fix silently.
 */
export function checksumOf(text: string): Address | null {
  try {
    return getAddress(text.trim());
  } catch {
    return null;
  }
}
