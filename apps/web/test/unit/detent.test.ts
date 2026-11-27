import { describe, expect, it } from 'vitest';
import { DETENT_MIN_S, pointerOffset, snapToMoment } from '../../src/flows/time-machine/detent';

describe('snapToMoment', () => {
  // The silent run of the unit fixture: moments at 0, 110 and 890 s on a 1 068 s slider (2 % = 21.36 s).
  const moments = [0, 110, 890];
  it('snaps within 2 % of the span, to the nearest moment', () => {
    expect(snapToMoment(118, moments, 1_068)).toBe(110);
    expect(snapToMoment(90, moments, 1_068)).toBe(110);
    expect(snapToMoment(140, moments, 1_068)).toBe(140);
    expect(snapToMoment(113, [110, 111, 112], 290)).toBe(112);
    expect(snapToMoment(50, [], 1_068)).toBe(50);
  });
  it('never snaps from further than DETENT_MIN_S on a short span, never closer than it either', () => {
    expect(DETENT_MIN_S).toBe(2);
    // 2 % of 50 s is 1 s: the floor of 2 s still catches a moment 2 s away.
    expect(snapToMoment(3, [0, 5], 50)).toBe(5);
    expect(snapToMoment(8, [0, 5], 50)).toBe(8);
  });
});

describe('pointerOffset', () => {
  it('maps the pointer over the track inset by half a thumb on each side, on the step grid', () => {
    // Root 600 px wide at x = 0, thumb 100 px: the track runs from 50 to 550.
    expect(pointerOffset(300, 0, 600, 50, 1_000, 1)).toBe(500);
    expect(pointerOffset(10, 0, 600, 50, 1_000, 1)).toBe(0);
    expect(pointerOffset(590, 0, 600, 50, 1_000, 1)).toBe(1_000);
    // (303 − 2 − 50) / 500 of 1 000 is 502: on the grid of 5, 500.
    expect(pointerOffset(303, 2, 600, 50, 1_000, 5)).toBe(500);
    // 1 068 / 5 rounds up past the end: clamped to it, so the end stays reachable.
    expect(pointerOffset(599, 0, 600, 22, 1_068, 5)).toBe(1_068);
    expect(pointerOffset(40, 0, 80, 50, 1_000, 1)).toBeNull();
  });
});
