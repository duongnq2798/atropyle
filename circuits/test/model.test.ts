import { describe, expect, it } from 'vitest';
import { cls, OUT, packInputs, refStep, refStepCode, S, unpackInputs, type PolicyInputs } from '../src/model';
import { violations } from '../src/properties';

const base: PolicyInputs = { idle: 0, threshold: 3, inhVotes: 0, recVotes: 0, k: 2, alive: false, windowDone: false };
const step = (s: number, patch: Partial<PolicyInputs>) => refStep(s, { ...base, ...patch });
const zero: PolicyInputs = { idle: 0, threshold: 0, inhVotes: 0, recVotes: 0, k: 0, alive: false, windowDone: false };

describe('model', () => {
  it('packs inputs at the spec bit positions', () => {
    expect(packInputs({ ...zero, idle: 15 })).toBe(0xf);
    expect(packInputs({ ...zero, threshold: 15 })).toBe(0xf0);
    expect(packInputs({ ...zero, inhVotes: 31 })).toBe(31 << 8);
    expect(packInputs({ ...zero, recVotes: 31 })).toBe(31 << 13);
    expect(packInputs({ ...zero, k: 7 })).toBe(7 << 18);
    expect(packInputs({ ...zero, alive: true })).toBe(1 << 21);
    expect(packInputs({ ...zero, windowDone: true })).toBe(1 << 22);
    expect(() => packInputs({ ...base, idle: 16 })).toThrow('idle out of range');
    for (const v of [0, 1, 0x7fffff, 0x2a5a5a]) expect(packInputs(unpackInputs(v))).toBe(v);
  });

  it('classifies all 8 state codes', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(cls)).toEqual([
      'active', 'grace', 'active', 'recovery', 'released', 'released', 'released', 'released',
    ]);
  });

  it('follows §3.4 from Active', () => {
    expect(step(S.ACTIVE, {})).toEqual({ next: S.ACTIVE, out: 0 });
    expect(step(S.ACTIVE, { idle: 3 })).toEqual({ next: S.GRACE, out: OUT.ALARM });
    expect(step(S.ACTIVE, { recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: OUT.ALARM });
    expect(step(S.ACTIVE, { idle: 3, recVotes: 0b11, alive: true })).toEqual({ next: S.ACTIVE, out: 0 });
  });

  it('follows §3.4 from Grace', () => {
    expect(step(S.GRACE, { idle: 3 })).toEqual({ next: S.GRACE, out: 0 });
    expect(step(S.GRACE, { windowDone: true })).toEqual({ next: S.GRACE, out: 0 });
    expect(step(S.GRACE, { windowDone: true, inhVotes: 0b101 })).toEqual({ next: S.RELEASED_INHERIT, out: OUT.RELEASE });
    expect(step(S.GRACE, { windowDone: true, idle: 15 })).toEqual({ next: S.RELEASED_INHERIT, out: OUT.RELEASE });
    expect(step(S.GRACE, { windowDone: true, inhVotes: 0b11, recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: OUT.ALARM });
    expect(step(S.GRACE, { alive: true })).toEqual({ next: S.ACTIVE, out: OUT.CANCEL });
  });

  it('follows §3.4 from RecoveryPending', () => {
    expect(step(S.RECOVERY, { recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: 0 });
    expect(step(S.RECOVERY, { recVotes: 0b11, windowDone: true })).toEqual({ next: S.RELEASED_RECOVER, out: OUT.RELEASE });
    expect(step(S.RECOVERY, { recVotes: 0b1, idle: 3 })).toEqual({ next: S.GRACE, out: OUT.ALARM });
    expect(step(S.RECOVERY, { recVotes: 0b1 })).toEqual({ next: S.ACTIVE, out: OUT.CANCEL });
    expect(step(S.RECOVERY, { recVotes: 0b11, alive: true })).toEqual({ next: S.ACTIVE, out: OUT.CANCEL });
  });

  // T = 3 and k = 2: idle 3 makes late true, and votes 0b11 (two of k = 2) make recQ true.
  it('gives recQ priority over late (§3.4)', () => {
    expect(step(S.ACTIVE, { idle: 3, recVotes: 0b1 })).toEqual({ next: S.GRACE, out: OUT.ALARM }); // late alone
    expect(step(S.ACTIVE, { idle: 3, recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: OUT.ALARM });
    expect(step(S.RECOVERY, { idle: 3, recVotes: 0b11 })).toEqual({ next: S.RECOVERY, out: 0 });
    expect(step(S.RECOVERY, { idle: 15, recVotes: 0b11, windowDone: true })).toEqual({
      next: S.RELEASED_RECOVER,
      out: OUT.RELEASE,
    });
  });

  it('treats k = 0 as the Simple template', () => {
    expect(step(S.GRACE, { k: 0, windowDone: true })).toEqual({ next: S.RELEASED_INHERIT, out: OUT.RELEASE });
    expect(step(S.ACTIVE, { k: 0, recVotes: 31 })).toEqual({ next: S.ACTIVE, out: 0 });
  });

  it('holds X=1 codes and treats 010 as Active', () => {
    for (const s of [4, 5, 6, 7]) {
      expect(step(s, { alive: true, idle: 15, windowDone: true })).toEqual({ next: s, out: 0 });
    }
    expect(step(2, { idle: 3 })).toEqual({ next: S.GRACE, out: OUT.ALARM });
    expect(step(2, {})).toEqual({ next: S.ACTIVE, out: 0 });
  });

  it('flags each property violation', () => {
    const late = packInputs({ ...base, idle: 3 });
    expect(violations(S.RELEASED_INHERIT, 0, S.ACTIVE, 0) & 1).toBe(1); // P1
    expect(violations(S.GRACE, packInputs({ ...base, alive: true }), S.GRACE, 0) & 2).toBe(2); // P2
    expect(violations(S.GRACE, 0, S.RELEASED_INHERIT, OUT.RELEASE) & 4).toBe(4); // P3: no window, no quorum
    expect(violations(S.RECOVERY, 0, S.RELEASED_RECOVER, OUT.RELEASE) & 8).toBe(8); // P4
    expect(violations(S.ACTIVE, packInputs(base), S.GRACE, OUT.ALARM) & 16).toBe(16); // P5: idle 0 < T 3
    expect(violations(S.ACTIVE, late, 2, 0) & 32).toBe(32); // P6
    expect(violations(S.ACTIVE, late, S.GRACE, 0) & 64).toBe(64); // P7: alarm missing
  });

  it('the model satisfies P1–P7 over all 2^26 combinations', () => {
    let bad = 0;
    for (let s = 0; s < 8; s++) {
      for (let v = 0; v < 1 << 23; v++) {
        const c = refStepCode(s, v);
        if (violations(s, v, c & 7, c >>> 3) !== 0) bad++;
      }
    }
    expect(bad).toBe(0);
  }, 300_000);
});
