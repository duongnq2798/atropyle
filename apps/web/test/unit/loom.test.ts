import { describe, expect, it } from 'vitest';
import { loomOf, timingOf } from '../../src/flows/impl/loom';
import { courseX, drawnAxis, GATE_X } from '../../src/thread/geometry';

const real = { preset: 'sixMonths', period: '', threshold: '', window: '' } as const;

describe('loom', () => {
  it('reads a preset and a custom timing, and null for a bad one', () => {
    expect(timingOf({ preset: 'drill', period: '', threshold: '', window: '' })).toEqual({
      period: 60,
      threshold: 2,
      window: 120,
    });
    expect(timingOf({ preset: 'custom', period: '30d', threshold: '3', window: '7d' })).toEqual({
      period: 2_592_000,
      threshold: 3,
      window: 604_800,
    });
    expect(timingOf({ preset: 'custom', period: 'x', threshold: '3', window: '7d' })).toBeNull();
    expect(timingOf({ preset: 'custom', period: '30d', threshold: '0', window: '7d' })).toBeNull();
  });

  it('puts the alarm at T·P and the gate where the heirs can first receive', () => {
    const l = loomOf({ drill: false, guardians: 0, k: 0, recoveryEnabled: false, timing: real });
    expect(l.state).toBe('releasedInherit');
    expect(l.axis).toMatchObject({ from: 0n, now: 0n, alarmAt: 15_552_000n, releaseAt: 16_761_600n });
    expect(l.heirsAfter).toBe(16_761_600);
    expect(l.exit).toBe(false);
  });

  it('ends the axis half a release past the gate, so the gate stands at two thirds and the branches fan out', () => {
    for (const guardians of [0, 3]) {
      const l = loomOf({ drill: false, guardians, k: guardians ? 2 : 0, recoveryEnabled: guardians > 0, timing: real });
      const axis = l.axis;
      if (!axis || axis.releaseAt === null) throw new Error('no release');
      expect(axis.to).toBe(axis.releaseAt + axis.releaseAt / 2n);
      // drawnAxis leaves it alone: the gate stands where the home thread has it.
      expect(drawnAxis(axis)).toEqual(axis);
      expect(courseX(axis.releaseAt, drawnAxis(axis))).toBe(GATE_X);
    }
  });

  it('draws an exit only when recovery is a route', () => {
    const on = loomOf({ drill: false, guardians: 3, k: 2, recoveryEnabled: true, timing: real });
    expect(on.exit).toBe(true);
    expect(on.exits?.earliest?.route).toBe('recovery');
    expect(loomOf({ drill: false, guardians: 0, k: 0, recoveryEnabled: true, timing: real }).exit).toBe(false);
  });

  it('a Drill that expires first curls up', () => {
    const t = { preset: 'custom', period: '3d', threshold: '3', window: '1d' } as const;
    const l = loomOf({ drill: true, guardians: 0, k: 0, recoveryEnabled: false, timing: t });
    expect(l.state).toBe('expired');
    expect(l.heirsAfter).toBeNull();
    // No gate: the axis keeps its end, just past the alarm when the Drill ends before it.
    expect(l.axis?.releaseAt).toBeNull();
    expect(l.axis?.to).toBe((l.axis?.alarmAt ?? 0n) + 1n);
  });

  it('waits while the timing cannot be read', () => {
    const l = loomOf({
      drill: false,
      guardians: 0,
      k: 0,
      recoveryEnabled: false,
      timing: { ...real, preset: 'custom' },
    });
    expect(l).toMatchObject({ timing: null, exits: null, axis: null, heirsAfter: null, exit: false });
  });
});
