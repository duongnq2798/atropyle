import type { SendResult, VaultEvent } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { momentOf, movedOf } from '../../src/app/vault/moment';
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
const s = (state: string, pending: string, expired = false) => ({ state, pending, expired }) as never;

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
    // Right after the receipt the page still holds the older read.
    expect(momentOf(s('active', 'grace'), moved)).toEqual({ kind: 'moved', state: 'grace', block: 77n });
    expect(momentOf(s('grace', 'grace'), moved)).toEqual({ kind: 'moved', state: 'grace', block: 77n });
    // The rules moved on again: the new prediction comes first.
    expect(momentOf(s('grace', 'releasedInherit'), moved)).toEqual({ kind: 'predicted', state: 'releasedInherit' });
    expect(momentOf(s('releasedInherit', 'releasedInherit'), moved)).toEqual({ kind: 'none' });
  });
});
