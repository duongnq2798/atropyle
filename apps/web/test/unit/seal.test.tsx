import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { POLICY_NETLIST_KECCAK } from '../../src/config/facts';
import { HASH_GROUPS, hashGroups, Seal } from '../../src/proof/seal';
import { renderWithProviders } from '../helpers/render';
import { okResult } from './proof-result';

/** A result whose policy netlist the chain gave as `keccak`. */
const withPolicy = (keccak: `0x${string}`, over: object = {}) =>
  okResult({ netlists: okResult().netlists.map((n) => (n.role === 'policy' ? { ...n, keccak, ...over } : n)) });
const UNREAD = '····';

describe('Seal', () => {
  it('cuts a 32-byte hash into groups of four hex digits, and nothing of another shape', () => {
    const groups = hashGroups(POLICY_NETLIST_KECCAK);
    expect(groups).toHaveLength(HASH_GROUPS);
    expect(groups?.every((g) => g.length === 4)).toBe(true);
    expect(groups?.join('')).toBe(POLICY_NETLIST_KECCAK.slice(2));
    expect(hashGroups(`${POLICY_NETLIST_KECCAK}00`)).toBeNull();
    expect(hashGroups('0x1234')).toBeNull();
    expect(hashGroups(null)).toBeNull();
  });

  it('before a run: the source row on screen, the chain row unread, both said in words', () => {
    renderWithProviders(<Seal result={undefined} />);
    const seal = screen.getByTestId('proof-seal');
    expect(seal.getAttribute('data-match')).toBe('pending');
    const chain = [...seal.querySelectorAll('[data-row="chain"]')].map((e) => e.textContent);
    expect(chain).toEqual(Array.from({ length: HASH_GROUPS }, () => UNREAD));
    expect(screen.getByTestId('proof-seal-words').textContent).toBe(
      `Top: built from this repository's source: ${POLICY_NETLIST_KECCAK}. Bottom: read from X\u00A0Layer when you run the proof.`,
    );
  });

  it('compares the groups whatever the case of the hex the chain gave', () => {
    const upper = `0x${POLICY_NETLIST_KECCAK.slice(2).toUpperCase()}` as const;
    renderWithProviders(<Seal result={withPolicy(upper)} />);
    const seal = screen.getByTestId('proof-seal');
    expect(seal.getAttribute('data-match')).toBe('equal');
    expect(seal.querySelectorAll('[data-sign="equal"]')).toHaveLength(HASH_GROUPS);
    expect(seal.textContent).toContain(`The two hashes are equal, all ${HASH_GROUPS} groups.`);
  });

  it('draws the grid for the eye only, and gives a screen reader both hashes in full', () => {
    const other = `0xffff${POLICY_NETLIST_KECCAK.slice(6, 62)}0000` as const;
    renderWithProviders(<Seal result={withPolicy(other, { matchesSource: false, matchesDeployment: false })} />);
    const seal = screen.getByTestId('proof-seal');
    expect(seal.querySelector('[data-group]')?.parentElement?.getAttribute('aria-hidden')).toBe('true');
    const words = screen.getByTestId('proof-seal-words');
    expect(words.closest('[aria-hidden="true"]')).toBeNull();
    expect(words.textContent).toContain(POLICY_NETLIST_KECCAK);
    expect(words.textContent).toContain(`Bottom: read from X\u00A0Layer at block 76600000: ${other}`);
  });
});
