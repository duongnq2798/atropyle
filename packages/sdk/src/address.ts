import { type Address, getAddress, isAddress } from 'viem';
import { AtropyleError } from './errors';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/**
 * Accepts lowercase, uppercase or checksummed input (the prefix 0x or 0X is optional) and returns the checksummed
 * form. Only a single-case body is taken as carrying no checksum; a mixed-case body must pass the checksum check,
 * whatever its prefix.
 */
export function toAddress(input: unknown, path = 'address'): Address {
  if (typeof input === 'string') {
    let s = input.trim();
    if (/^(0[xX])?[0-9a-fA-F]{40}$/.test(s)) {
      const body = s.slice(-40);
      s = `0x${body === body.toLowerCase() || body === body.toUpperCase() ? body.toLowerCase() : body}`;
    }
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
