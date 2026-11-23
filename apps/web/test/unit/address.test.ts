import { describe, expect, it } from 'vitest';
import { addressGroups, compactAddress, isAddressText } from '../../src/lib/address';

const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('address text', () => {
  it('recognises a 0x-prefixed 40-digit hex string only', () => {
    expect(isAddressText(A)).toBe(true);
    expect(isAddressText(A.toLowerCase())).toBe(true);
    expect(isAddressText(A.slice(0, 41))).toBe(false);
    expect(isAddressText(`${A}0`)).toBe(false);
    expect(isAddressText(A.replace('0x', '0X'))).toBe(false);
    expect(isAddressText(' '.repeat(42))).toBe(false);
  });

  it('splits the full address into ten groups of four after the prefix (spec §4.2)', () => {
    const g = addressGroups(A);
    expect(g).toEqual(['0x', '3C44', 'CdDd', 'B6a9', '00fa', '2b58', '5dd2', '99e0', '3d12', 'FA42', '93BC']);
    expect(g.join('')).toBe(A);
  });

  it('keeps anything that is not an address as one piece', () => {
    expect(addressGroups('vault.eth')).toEqual(['vault.eth']);
  });

  it('compacts only for the header account button: first and last two groups', () => {
    expect(compactAddress(A)).toBe('0x3C44 CdDd … FA42 93BC');
    expect(compactAddress('short')).toBe('short');
  });
});
