import { type Address, getAddress, isAddress } from 'viem';
import { AtropyleError } from './errors';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/** Accepts lowercase, uppercase or checksummed input (0x optional); rejects a mixed-case bad checksum. */
export function toAddress(input: unknown, path = 'address'): Address {
  if (typeof input === 'string') {
    let s = input.trim();
    if (/^[0-9a-fA-F]{40}$/.test(s)) s = `0x${s}`;
    const body = s.slice(2);
    if (/^0x[0-9A-F]{40}$/.test(s) || /^0X[0-9a-fA-F]{40}$/.test(s)) s = `0x${body.toLowerCase()}`;
    if (isAddress(s, { strict: true })) return getAddress(s);
  }
  throw new AtropyleError('INVALID_ADDRESS', {
    message: `${path}: not a valid address`,
    details: { path, value: String(input).slice(0, 100) },
  });
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
