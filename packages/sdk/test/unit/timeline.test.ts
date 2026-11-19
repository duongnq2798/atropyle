import { buildAll } from '@atropyle/circuits';
import { describe, expect, it } from 'vitest';
import { modelEngine, programEngine, timelineOf } from '../../src/index';
import { DAY, makeSnapshot, NEW_WALLET } from './fixtures';

const DRILL = { period: 60, threshold: 2, window: 120 };

describe.each([
  ['model', modelEngine()],
  ['netlist', programEngine(buildAll().program)],
])('timeline (%s engine)', (_name, engine) => {
  const brief = (t: ReturnType<typeof timelineOf>) => t.events.map((e) => [e.kind, e.state, e.at]);

  it('simple vault: alarm when late, release when the window ends', () => {
    const t = timelineOf(engine, makeSnapshot({ k: 0, recoveryEnabled: false, timing: DRILL }), 10n);
    expect(brief(t)).toEqual([
      ['alarm', 'grace', 120n],
      ['release', 'releasedInherit', 240n],
    ]);
    expect(t.earliestRelease).toBe(240n);
    expect(t.nextCheckAt).toBe(120n);
    expect(t.milestones).toMatchObject({ lateAt: 120n, maxedAt: 900n, windowEndsAt: null });
  });

  it('guarded vault without votes falls back to the 15-period release', () => {
    const t = timelineOf(engine, makeSnapshot(), 10n);
    expect(brief(t)).toEqual([
      ['alarm', 'grace', 3n * DAY],
      ['release', 'releasedInherit', 15n * DAY],
    ]);
    expect(t.events[1].note).toContain('15-period fallback');
  });

  it('enough attestations release at the end of the window', () => {
    const t = timelineOf(engine, makeSnapshot({ state: 'grace', alarmAt: 3n * DAY, inhVotes: 0b011 }), 4n * DAY);
    expect(brief(t)).toEqual([['release', 'releasedInherit', 6n * DAY]]);
  });

  it('recovery releases to the target when the window ends', () => {
    const snap = makeSnapshot({
      state: 'recovery',
      alarmAt: DAY,
      recoveryTarget: NEW_WALLET,
      recVotes: [NEW_WALLET, NEW_WALLET, null],
    });
    expect(brief(timelineOf(engine, snap, DAY + 5n))).toEqual([['release', 'releasedRecover', 4n * DAY]]);
  });

  it('a transition that is already due shows at now', () => {
    const t = timelineOf(engine, makeSnapshot({ k: 0, recoveryEnabled: false, timing: DRILL }), 130n);
    expect(brief(t)[0]).toEqual(['alarm', 'grace', 130n]);
    expect(t.nextCheckAt).toBe(130n);
  });

  it('expired drill: drillExpiry before release, nothing after expiry', () => {
    const snap = makeSnapshot({ k: 0, recoveryEnabled: false, timing: DRILL, drill: true, expiresAt: 200n });
    const t = timelineOf(engine, snap, 10n);
    expect(brief(t)).toEqual([
      ['alarm', 'grace', 120n],
      ['drillExpiry', 'grace', 200n],
    ]);
    expect(t.earliestRelease).toBeNull();
    expect(t.nextCheckAt).toBe(120n);
    const after = timelineOf(
      engine,
      { ...snap, status: { ...snap.status, blockTimestamp: 200n, expired: true } },
      200n,
    );
    expect(after.events).toEqual([]);
    expect(after.nextCheckAt).toBeNull();
  });

  it('a Drill that releases at 240 still ends at its expiry at 1000', () => {
    const snap = makeSnapshot({ k: 0, recoveryEnabled: false, timing: DRILL, drill: true, expiresAt: 1000n });
    const t = timelineOf(engine, snap, 10n);
    expect(brief(t)).toEqual([
      ['alarm', 'grace', 120n],
      ['release', 'releasedInherit', 240n],
      ['drillExpiry', 'releasedInherit', 1000n],
    ]);
    expect(t.earliestRelease).toBe(240n);
    expect(t.nextCheckAt).toBe(120n);
  });

  it('released vaults have no future events', () => {
    const t = timelineOf(engine, makeSnapshot({ state: 'releasedInherit' }), 10n);
    expect(t.events).toEqual([]);
    expect(t.nextCheckAt).toBeNull();
  });
});
