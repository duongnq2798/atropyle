import { exitTimes, modelEngine, PRESETS } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/flows/impl/time-machine';
import { HERO_BASE } from '../../src/home/impl/hero-states';
import { homeRuns, RECOVER_BASE, stageEngine } from '../../src/home/impl/stage';
import {
  beatAt,
  beatsOf,
  DAY,
  dayOf,
  HOME_OPTIONS,
  HOME_PEOPLE,
  HOME_VAULT,
  INHERIT_DAYS,
  LATE_OPTIONS,
  PERIOD_DAYS,
  RECOVER_DAYS,
  STAGE_RUNS,
  STORY_IDS,
  type StageRun,
  storyOf,
  WINDOW_DAYS,
} from '../../src/home/sim-days';

const SIX = PRESETS.sixMonths;
const days = (seconds: number) => seconds / Number(DAY);
/** A row as one line: its days, its key, and the missed periods of a fallback. */
const lines = (run: StageRun) =>
  beatsOf(run).map(
    (b) => `${b.day}${b.until === null ? '' : `–${b.until}`} ${b.key}${b.missed === null ? '' : ` ${b.missed}`}`,
  );
function routeAfter(x: ReturnType<typeof exitTimes>, route: 'heirs' | 'heirsFallback' | 'recovery'): number {
  const r = x.routes.find((y) => y.route === route);
  if (!r) throw new Error(`no ${route} route`);
  return r.after;
}

describe('the home stage stories (spec §18.4.3 Task 6)', () => {
  it('prerender exactly what scenarios() computes on the repository netlist', () => {
    expect(stageEngine().kind).toBe('netlist');
    expect(homeRuns(scenarios)).toEqual(STAGE_RUNS);
  });

  it('are the same on the reference model', () => {
    const model = homeRuns(scenarios, modelEngine());
    for (const id of STORY_IDS) expect({ ...model[id], engine: 'netlist' }).toEqual(STAGE_RUNS[id]);
  });

  it('use the options of the spec, the sixMonths preset and the hero vault', () => {
    expect(HOME_OPTIONS).toEqual({
      confirmAt: 183n * DAY,
      returnAt: 187n * DAY,
      votesAt: [10n * DAY, 12n * DAY],
      blockAt: 20n * DAY,
    });
    expect(LATE_OPTIONS.confirmAt).toBeGreaterThanOrEqual(LATE_OPTIONS.returnAt);
    expect(HERO_BASE.timing).toEqual(SIX);
    expect(BigInt(SIX.period)).toBe(BigInt(PERIOD_DAYS) * DAY);
    expect(BigInt(SIX.window)).toBe(BigInt(WINDOW_DAYS) * DAY);
    expect(HERO_BASE.owner).toBe(HOME_PEOPLE.owner);
    expect(HERO_BASE.guardians).toEqual([HOME_PEOPLE.g1, HOME_PEOPLE.g2]);
    expect({ k: HERO_BASE.k, n: HERO_BASE.guardians.length }).toEqual(HOME_VAULT.inherit);
    expect({ k: RECOVER_BASE.k, n: RECOVER_BASE.guardians.length }).toEqual(HOME_VAULT.recover);
    expect(RECOVER_BASE.guardians).toEqual([HOME_PEOPLE.g1, HOME_PEOPLE.g2, HOME_PEOPLE.g3]);
  });

  it("date every milestone as the SDK's exitTimes does (7C-main-sync)", () => {
    const terms = (s: typeof HERO_BASE) => ({
      drill: false,
      guardians: s.guardians,
      k: s.k,
      recoveryEnabled: true,
      timing: SIX,
    });
    const heirs = exitTimes(terms(HERO_BASE));
    const recovery = exitTimes(terms(RECOVER_BASE));
    expect(INHERIT_DAYS.alarm).toBe(days(SIX.threshold * SIX.period));
    expect(INHERIT_DAYS.release).toBe(days(routeAfter(heirs, 'heirs')));
    expect(INHERIT_DAYS.fallback).toBe(days(routeAfter(heirs, 'heirsFallback')));
    expect(RECOVER_DAYS.release - RECOVER_DAYS.vote2).toBe(days(routeAfter(recovery, 'recovery')));
    expect(INHERIT_DAYS.release - INHERIT_DAYS.alarm).toBe(WINDOW_DAYS);
    expect(INHERIT_DAYS.nextAlarm).toBe(INHERIT_DAYS.back + INHERIT_DAYS.alarm);
    expect(INHERIT_DAYS.nextFallback).toBe(INHERIT_DAYS.back + INHERIT_DAYS.fallback);
    expect(RECOVER_DAYS.nextAlarm).toBe(RECOVER_DAYS.block + INHERIT_DAYS.alarm);
    expect(RECOVER_DAYS.nextFallback).toBe(RECOVER_DAYS.block + INHERIT_DAYS.fallback);
  });

  it('tell each story in dated rows, with a quiet stretch before each alarm', () => {
    expect(lines(STAGE_RUNS.confirm)).toEqual(['0 start', '1–179 quiet', '180 alarm', '183 confirm', '194 gate']);
    expect(lines(STAGE_RUNS.silent)).toEqual(['0 start', '1–179 quiet', '180 alarm', '450 gateFallback 15']);
    expect(lines(STAGE_RUNS.confirmBack)).toEqual([
      '0 start',
      '1–179 quiet',
      '180 alarm',
      '183 confirm',
      '187 back',
      '188–366 quiet',
      '367 alarm',
      '637 gateFallback 15',
    ]);
    expect(lines(STAGE_RUNS.back)).toEqual([
      '0 start',
      '1–179 quiet',
      '180 alarm',
      '187 back',
      '188–366 quiet',
      '367 alarm',
      '637 gateFallback 15',
    ]);
    expect(lines(STAGE_RUNS.recover)).toEqual(['0 start', '10 vote', '12 voteEnough', '26 gateRecover']);
    expect(lines(STAGE_RUNS.recoverBack)).toEqual([
      '0 start',
      '10 vote',
      '12 voteEnough',
      '20 backRecovery',
      '21–199 quiet',
      '200 alarm',
      '470 gateFallback 15',
    ]);
  });

  it("give the spec's stamps their days: 180, 183 and 194, then 10, 12 and 26", () => {
    expect(
      beatsOf(STAGE_RUNS.confirm)
        .filter((b) => b.until === null)
        .map((b) => b.day),
    ).toEqual([0, 180, 183, 194]);
    expect(beatsOf(STAGE_RUNS.recover).map((b) => b.day)).toEqual([0, 10, 12, 26]);
  });

  it('follow the chips and the switches', () => {
    expect(storyOf('inherit', true, false)).toBe('confirm');
    expect(storyOf('inherit', false, false)).toBe('silent');
    expect(storyOf('inherit', true, true)).toBe('confirmBack');
    expect(storyOf('inherit', false, true)).toBe('back');
    expect(storyOf('recover', true, false)).toBe('recover');
    expect(storyOf('recover', false, true)).toBe('recoverBack');
  });

  it('find the row of any day', () => {
    const beats = beatsOf(STAGE_RUNS.confirm);
    const at = (d: number) => beatAt(beats, d * Number(DAY)).key;
    expect([at(0), at(1), at(90), at(179), at(180), at(182), at(183), at(194), at(230)]).toEqual([
      'start',
      'quiet',
      'quiet',
      'quiet',
      'alarm',
      'alarm',
      'confirm',
      'gate',
      'gate',
    ]);
    expect(dayOf(180n * DAY + 86_399n)).toBe(180);
  });
});
