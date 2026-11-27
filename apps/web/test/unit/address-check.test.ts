import { describe, expect, it } from 'vitest';
import { addressIssue, checksumOf, duplicateIndexes } from '../../src/flows/impl/address-check';
import { PEOPLE } from './fixtures';

describe('address checks', () => {
  it('accepts a checksummed or lowercase address and flags a broken checksum', () => {
    expect(addressIssue(PEOPLE.heirA)).toBeNull();
    expect(addressIssue(PEOPLE.heirA.toLowerCase())).toBeNull();
    expect(addressIssue(`  ${PEOPLE.heirA} `)).toBeNull();
    // One letter in the wrong case: same characters, a different (invalid) checksum.
    expect(addressIssue(PEOPLE.heirA.replace('0x3C', '0x3c'))).toBe('checksum');
    expect(addressIssue('0x1234')).toBe('invalid');
    expect(addressIssue('hello')).toBe('invalid');
    expect(addressIssue(`0x${'0'.repeat(40)}`)).toBe('zero');
    expect(addressIssue('')).toBeNull();
  });

  it('names each repeat after its first appearance, ignoring case and empty rows', () => {
    expect(duplicateIndexes([PEOPLE.heirA, '', PEOPLE.heirA.toLowerCase(), PEOPLE.heirB, ' ', PEOPLE.heirB])).toEqual([
      2, 5,
    ]);
    expect(duplicateIndexes([])).toEqual([]);
  });

  it('checksums what it can read', () => {
    expect(checksumOf(PEOPLE.heirA.toLowerCase())).toBe(PEOPLE.heirA);
    expect(checksumOf('nope')).toBeNull();
  });
});
