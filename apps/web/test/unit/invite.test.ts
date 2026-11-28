import { AtropyleError, toAddress } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { heirIndex, namedRoles, parseInvite, walletMatch } from '../../src/app/join/invite';
import { fixtureSnapshot, PEOPLE } from './fixtures';

// The EIP-55 test vector: mixed case, so one changed letter breaks its checksum.
const V = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const EDITED = V.replace('F3E', 'f3E');

describe('invitation links', () => {
  it('accept a vault address in the shape of one and the role guardian or heir', () => {
    expect(parseInvite(`#${V}.heir`)).toEqual({ ok: true, vault: V, role: 'heir' });
    expect(parseInvite(`#${V.toLowerCase()}.guardian`)).toEqual({ ok: true, vault: V.toLowerCase(), role: 'guardian' });
    // The checksum is the SDK's, inside the read and before any request (use-invited-vault.ts).
    expect(parseInvite(`#${EDITED}.heir`)).toEqual({ ok: true, vault: EDITED, role: 'heir' });
  });

  it('refuse a link that was cut, edited or padded, and say which part is wrong', () => {
    expect(parseInvite('')).toEqual({ ok: false, reason: 'missing' });
    expect(parseInvite('#')).toEqual({ ok: false, reason: 'missing' });
    expect(parseInvite(`#${V}`)).toEqual({ ok: false, reason: 'shape' });
    expect(parseInvite(`#${V}.heir.extra`)).toEqual({ ok: false, reason: 'shape' });
    expect(parseInvite(`#${V}.heir${'x'.repeat(200)}`)).toEqual({ ok: false, reason: 'shape' });
    expect(parseInvite('#0x1234.heir')).toEqual({ ok: false, reason: 'address' });
    expect(parseInvite(`#0X${V.slice(2)}.heir`)).toEqual({ ok: false, reason: 'address' });
    expect(parseInvite(`#${V}.owner`)).toEqual({ ok: false, reason: 'role' });
    expect(parseInvite(`#${V}.Heir`)).toEqual({ ok: false, reason: 'role' });
  });

  it('leave a changed checksum to toAddress, which refuses it as INVALID_ADDRESS', () => {
    expect(toAddress(V)).toBe(V);
    expect(toAddress(V.toLowerCase())).toBe(V);
    let caught: unknown;
    try {
      toAddress(EDITED, 'vault');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AtropyleError);
    expect((caught as AtropyleError).code).toBe('INVALID_ADDRESS');
  });
});

describe('the wallet named in a vault', () => {
  const { config } = fixtureSnapshot();

  it('reads the roles of an account from the vault lists, in any letter case', () => {
    expect(namedRoles(config, null)).toEqual([]);
    expect(namedRoles(config, PEOPLE.owner)).toEqual(['owner']);
    expect(namedRoles(config, PEOPLE.heirA.toLowerCase())).toEqual(['heir']);
    expect(namedRoles(config, PEOPLE.heirB)).toEqual(['guardian', 'heir']);
    expect(namedRoles(config, PEOPLE.stranger)).toEqual([]);
  });

  it('finds the heir to light their branch and name their share', () => {
    expect(heirIndex(config, PEOPLE.heirB)).toBe(1);
    expect(heirIndex(config, PEOPLE.g1)).toBe(-1);
    expect(heirIndex(config, null)).toBe(-1);
  });

  it('compares the roles with the role of the link', () => {
    expect(walletMatch(['guardian', 'heir'], 'heir')).toBe('yes');
    expect(walletMatch(['owner'], 'heir')).toBe('other');
    expect(walletMatch([], 'guardian')).toBe('no');
  });
});
