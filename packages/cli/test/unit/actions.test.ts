import { describe, expect, it } from 'vitest';
import { buildAction } from '../../src/actions';
import type { ActionFlags } from '../../src/args';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const flags = (o: Partial<ActionFlags> = {}): ActionFlags => ({ heir: [], guardian: [], asset: [], ...o });
const codeOf = (f: () => unknown) => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { code: string }).code;
  }
};

describe('buildAction', () => {
  it('maps kebab-case names and lists them on a typo', () => {
    expect(buildAction('check-in', flags())).toEqual({ type: 'checkIn' });
    expect(buildAction('revoke-all', flags())).toEqual({ type: 'revokeAll' });
    expect(() => buildAction('fly', flags())).toThrow(/check-in, set-heirs/);
    expect(codeOf(() => buildAction('checkIn', flags()))).toBe('INVALID_OPTIONS');
  });

  it('does not take names from the prototype chain', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(
        codeOf(() => buildAction(name, flags())),
        name,
      ).toBe('INVALID_OPTIONS');
      expect(() => buildAction(name, flags())).toThrow(/Use one of: check-in, set-heirs/);
    }
  });

  it('splits heirs equally when no share is given, and gives the rest to the first', () => {
    expect(buildAction('set-heirs', flags({ heir: [A(2), A(5), A(6)] }))).toEqual({
      type: 'setHeirs',
      heirs: [
        { account: A(2), bps: 3334 },
        { account: A(5), bps: 3333 },
        { account: A(6), bps: 3333 },
      ],
    });
  });

  it('takes percents, and refuses a mix or a bad share', () => {
    expect(buildAction('set-heirs', flags({ heir: [`${A(2)}:70`, `${A(5)}:30`] }))).toEqual({
      type: 'setHeirs',
      heirs: [
        { account: A(2), percent: 70 },
        { account: A(5), percent: 30 },
      ],
    });
    expect(codeOf(() => buildAction('set-heirs', flags({ heir: [`${A(2)}:70`, A(5)] })))).toBe('INVALID_OPTIONS');
    expect(codeOf(() => buildAction('set-heirs', flags({ heir: [`${A(2)}:lots`] })))).toBe('INVALID_OPTIONS');
    expect(codeOf(() => buildAction('set-heirs', flags({ heir: ['0x12'] })))).toBe('INVALID_ADDRESS');
    expect(codeOf(() => buildAction('set-heirs', flags()))).toBe('INVALID_OPTIONS');
  });

  it('reads assets as kind:token[:id][@heir]', () => {
    expect(buildAction('set-assets', flags({ asset: [`erc20:${A(9)}`, `erc721:${A(8)}:42@1`] }))).toEqual({
      type: 'setAssets',
      assets: [
        { kind: 'erc20', token: A(9) },
        { kind: 'erc721', token: A(8), id: '42', heir: 1 },
      ],
    });
    expect(codeOf(() => buildAction('set-assets', flags({ asset: ['usdt'] })))).toBe('INVALID_OPTIONS');
  });

  it('builds guardian actions', () => {
    expect(buildAction('attest-death', flags())).toEqual({ type: 'attestDeath', on: true });
    expect(buildAction('attest-death', flags({ off: true }))).toEqual({ type: 'attestDeath', on: false });
    expect(buildAction('vote-recovery', flags({ target: A(6) }))).toEqual({ type: 'voteRecovery', target: A(6) });
    expect(buildAction('vote-recovery', flags({ withdraw: true }))).toEqual({ type: 'voteRecovery', target: null });
    expect(codeOf(() => buildAction('vote-recovery', flags()))).toBe('INVALID_OPTIONS');
    expect(buildAction('set-guardians', flags({ guardian: [A(3), A(4)], k: '2', recovery: true }))).toEqual({
      type: 'setGuardians',
      guardians: [A(3), A(4)],
      k: 2,
      recoveryEnabled: true,
    });
  });

  it('reads a timing preset or a custom timing', () => {
    expect(buildAction('set-timing', flags({ timing: 'sixMonths' }))).toEqual({
      type: 'setTiming',
      timing: 'sixMonths',
    });
    expect(buildAction('set-timing', flags({ period: '30d', threshold: '3', window: '7d' }))).toEqual({
      type: 'setTiming',
      timing: { period: 2_592_000, threshold: 3, window: 604_800 },
    });
    expect(codeOf(() => buildAction('set-timing', flags({ period: '30d' })))).toBe('INVALID_OPTIONS');
    expect(codeOf(() => buildAction('set-timing', flags({ timing: 'weekly' })))).toBe('INVALID_OPTIONS');
    expect(codeOf(() => buildAction('set-timing', flags({ period: 'soon', threshold: '3', window: '7d' })))).toBe(
      'INVALID_OPTIONS',
    );
  });

  it('refuses flags that do not belong to the action', () => {
    expect(codeOf(() => buildAction('check-in', flags({ heir: [A(2)] })))).toBe('INVALID_OPTIONS');
    expect(codeOf(() => buildAction('attest-death', flags({ target: A(6) })))).toBe('INVALID_OPTIONS');
  });
});
