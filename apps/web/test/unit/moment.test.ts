import type { SendResult, VaultEvent } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { betweenReads, forgetBefore, momentOf, movedOf } from '../../src/app/vault/moment';
import { PEOPLE } from './fixtures';

const event = (name: string, args: Record<string, unknown>): VaultEvent => ({
  address: PEOPLE.vault,
  name,
  args,
  blockNumber: 77n,
  logIndex: 0,
  transactionHash: `0x${'2'.repeat(64)}`,
});
const sent = (events: VaultEvent[]): SendResult => ({
  vault: PEOPLE.vault,
  steps: [{ index: 0, action: 'poke', hash: `0x${'2'.repeat(64)}`, blockNumber: 77n, gasUsed: 1n, events }],
});
/** A read at `blockNumber` (block 76 by default: the one just before the receipt below). */
const s = (state: string, pending: string, expired = false, blockNumber = 76n) =>
  ({ state, pending, expired, blockNumber }) as never;

describe('the moment line', () => {
  it('takes the state a confirmed send moved to, and its block', () => {
    expect(movedOf(sent([event('AlarmRaised', { state: 1 }), event('StateChanged', { from: 0, to: 1 })]))).toEqual({
      to: 'grace',
      block: 77n,
    });
    expect(movedOf(sent([event('Distributed', {})]))).toBeNull();
  });

  it('names what the rules allow that nobody has asked for, then what this page did', () => {
    expect(momentOf(s('active', 'active'), null)).toEqual({ kind: 'none' });
    expect(momentOf(s('active', 'grace'), null)).toEqual({ kind: 'predicted', state: 'grace' });
    expect(momentOf(s('active', 'grace', true), null)).toEqual({ kind: 'none' });
    const moved = { to: 'grace' as const, block: 77n };
    // Right after the receipt the page still holds the older read (block 76).
    expect(momentOf(s('active', 'grace'), moved)).toEqual({ kind: 'moved', state: 'grace', block: 77n });
    // The newer read carries the change.
    expect(momentOf(s('grace', 'grace', false, 77n), moved)).toEqual({ kind: 'moved', state: 'grace', block: 77n });
    // The rules moved on again: the new prediction comes first.
    expect(momentOf(s('grace', 'releasedInherit', false, 90n), moved)).toEqual({
      kind: 'predicted',
      state: 'releasedInherit',
    });
    expect(momentOf(s('releasedInherit', 'releasedInherit', false, 90n), moved)).toEqual({ kind: 'none' });
  });

  it('never tells an old change as the one that made a newer read (review fix 1)', () => {
    // A keeper raised the alarm at 77; the owner checked in unseen; the owner is late again at 200.
    const stale = { to: 'grace' as const, block: 77n };
    expect(momentOf(s('active', 'grace', false, 200n), stale)).toEqual({ kind: 'predicted', state: 'grace' });
    // A read at the very block of the change already carries it: it is not "the older read".
    expect(momentOf(s('active', 'grace', false, 77n), stale)).toEqual({ kind: 'predicted', state: 'grace' });
  });

  it('forgets a change seen before a gap it cannot look into', () => {
    const m = { to: 'grace' as const, block: 77n };
    expect(forgetBefore(null, 100n)).toBeNull();
    expect(forgetBefore(m, 100n)).toBeNull();
    expect(forgetBefore(m, 77n)).toBeNull();
    // A receipt newer than the older read of the gap still holds.
    expect(forgetBefore(m, 76n)).toBe(m);
  });

  it('looks between two reads only when the state changed and the span fits one eth_getLogs', () => {
    const r = (state: string, blockNumber: bigint) => ({ state, blockNumber }) as never;
    expect(betweenReads(r('active', 100n), r('active', 100n), 100n)).toBe('none');
    expect(betweenReads(r('active', 100n), r('grace', 90n), 100n)).toBe('none');
    expect(betweenReads(r('active', 100n), r('active', 130n), 100n)).toBe('none');
    expect(betweenReads(r('active', 100n), r('grace', 130n), 100n)).toBe('lookup');
    expect(betweenReads(r('active', 100n), r('grace', 200n), 100n)).toBe('lookup');
    // A tab asleep: nothing is known of the span, even when both reads show the same state (a round trip).
    expect(betweenReads(r('active', 100n), r('grace', 201n), 100n)).toBe('blind');
    expect(betweenReads(r('grace', 100n), r('grace', 201n), 100n)).toBe('blind');
  });
});
