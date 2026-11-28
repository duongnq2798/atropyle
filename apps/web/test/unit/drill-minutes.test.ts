// @vitest-environment node
import { computeTimeline, type EvalState, modelEngine, PRESETS, STATE_CODES } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { KEEPER_CADENCE_S } from '../../src/config/facts';
import { messages as create } from '../../src/messages/create.messages';
import { messages as home } from '../../src/messages/home.messages';
import { messages as me } from '../../src/messages/me.messages';

/** A Drill with no guardians, checked in at t = 0: the vault that "Rehearse it" on the home page starts. */
const DRILL: EvalState = {
  state: STATE_CODES.active,
  owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  lastAlive: 0n,
  alarmAt: 0n,
  timing: PRESETS.drill,
  k: 0,
  recoveryEnabled: false,
  guardians: [],
  inhVotes: 0,
  recVotes: [],
  recoveryTarget: null,
};

const timeline = computeTimeline(modelEngine(), DRILL, 0n, null);

/** Release at the earliest, plus two keeper runs (one raises the alarm, one releases), in whole minutes (R18.11). */
function drillMinutes(): number {
  if (timeline.earliestRelease === null) throw new Error('a silent Drill never releases');
  return Math.ceil(Number(timeline.earliestRelease + 2n * BigInt(KEEPER_CADENCE_S)) / 60);
}

describe('the Drill on the home page', () => {
  it('a silent Drill raises the alarm, then releases', () => {
    expect(timeline.events.map((e) => e.kind)).toEqual(['alarm', 'release']);
    expect(timeline.earliestRelease).not.toBeNull();
  });

  it('promises the minutes the rules give, in both languages', () => {
    // If the SDK gives another number, change the copy, never this test (spec §18.4.1 item 4).
    for (const lang of ['en', 'vi'] as const) {
      const numbers = [...home[lang].heroDrill.matchAll(/\d+/g)].map((m) => Number(m[0]));
      expect(numbers, lang).toEqual([drillMinutes()]);
    }
  });

  it('the fee note states no number of its own', () => {
    for (const lang of ['en', 'vi'] as const) expect(home[lang].heroDrillNote, lang).not.toMatch(/\d/);
  });
});

describe('the facts of the home hero', () => {
  it('state no number of their own: the date comes through {date} (spec §18.2 principle 3)', () => {
    for (const lang of ['en', 'vi'] as const) {
      for (const key of ['heroFactCustody', 'heroFactLive', 'heroHeirDoor'] as const) {
        expect(home[lang][key], `${lang}.${key}`).not.toMatch(/\d/);
      }
    }
  });
});

describe('the Drill on /me/', () => {
  it('promises the same minutes as the home page, in both languages', () => {
    for (const lang of ['en', 'vi'] as const) {
      const numbers = [...me[lang].rehearse.matchAll(/\d+/g)].map((m) => Number(m[0]));
      expect(numbers, lang).toEqual([drillMinutes()]);
    }
  });
});

describe('the Drill on the create page', () => {
  it('promises the same minutes as the home page, and no fee number', () => {
    for (const lang of ['en', 'vi'] as const) {
      const numbers = [...create[lang].kindDrillHelp.matchAll(/\d+/g)].map((m) => Number(m[0]));
      expect(numbers, lang).toEqual([drillMinutes()]);
      expect(create[lang].feeFree, lang).not.toMatch(/\d/);
    }
  });
});
