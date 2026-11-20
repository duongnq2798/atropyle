import { sameAddress, type VaultSnapshot } from '@atropyle/sdk';
import { type Address, getAddress, isAddress, zeroAddress } from 'viem';

export type TargetCheck = { ok: true; target: Address } | { ok: false; reason: 'empty' | 'invalid' | 'mismatch' };

/**
 * The new wallet is typed or pasted twice and both must match (spec §16.3). It never comes from the URL.
 * Mixed-case input must carry a valid checksum, which catches most single-character typos. This is stricter than the
 * SDK's `toAddress` on purpose: a vote moves everything, so a typo must not slip through as a different address.
 */
export function confirmTarget(first: string, second: string): TargetCheck {
  const a = first.trim();
  const b = second.trim();
  if (a === '' || b === '') return { ok: false, reason: 'empty' };
  if (!isAddress(a) || !isAddress(b)) return { ok: false, reason: 'invalid' };
  if (a.toLowerCase() !== b.toLowerCase()) return { ok: false, reason: 'mismatch' };
  // Zero is the withdraw marker on chain; a vote for it would not be a vote for a wallet.
  if (a.toLowerCase() === zeroAddress) return { ok: false, reason: 'invalid' };
  return { ok: true, target: getAddress(a) };
}

export interface GuardianRow {
  guardian: Address;
  attested: boolean;
  target: Address | null;
  me: boolean;
}

export function guardianRows(snap: VaultSnapshot, account: string | null): GuardianRow[] {
  const s = snap.status;
  return snap.config.guardians.map((guardian) => ({
    guardian,
    attested: s.inhVoters.some((v) => sameAddress(v, guardian)),
    target: s.recVotes.find((v) => sameAddress(v.guardian, guardian))?.target ?? null,
    me: account !== null && sameAddress(guardian, account),
  }));
}

export interface TargetTally {
  target: Address;
  votes: number;
}

export function tally(rows: readonly GuardianRow[]): TargetTally[] {
  const byTarget = new Map<string, TargetTally>();
  for (const r of rows) {
    if (!r.target) continue;
    const key = r.target.toLowerCase();
    const entry = byTarget.get(key) ?? { target: r.target, votes: 0 };
    entry.votes += 1;
    byTarget.set(key, entry);
  }
  return [...byTarget.values()].sort((x, y) => y.votes - x.votes);
}
