import { buildAll } from '@atropyle/circuits';
import { describe, expect, it } from 'vitest';
import {
  computeTimeline,
  deriveInputs,
  type EvalState,
  type ExitRoute,
  exitTimes,
  modelEngine,
  PRESETS,
  programEngine,
  STATE_CODES,
  type Timing,
} from '../../src/index';
import { G1, G2, G3, NEW_WALLET, OWNER } from './fixtures';

const T0 = 1_000_000n;
const GUARDIANS = [G1, G2, G3];

function state(timing: Timing, k: number, over: Partial<EvalState> = {}): EvalState {
  return {
    state: STATE_CODES.active,
    owner: OWNER,
    lastAlive: T0,
    alarmAt: 0n,
    timing,
    k,
    recoveryEnabled: k > 0,
    guardians: GUARDIANS,
    inhVotes: 0,
    recVotes: GUARDIANS.map(() => null),
    recoveryTarget: null,
    ...over,
  };
}

const TIMINGS: [string, Timing][] = [
  ['drill preset', PRESETS.drill],
  ['fastest Drill', { period: 60, threshold: 1, window: 60 }],
  ['sixMonths', PRESETS.sixMonths],
  ['twelveMonths', PRESETS.twelveMonths],
  ['threshold 15', { period: 86400, threshold: 15, window: 3 * 86400 }],
  ['long window', { period: 86400, threshold: 1, window: 30 * 86400 }],
];

describe.each([
  ['model', modelEngine()],
  ['netlist', programEngine(buildAll().program)],
])('exitTimes agrees with the policy (%s engine)', (_name, engine) => {
  /** When the policy releases along `route`, found by running it, never by the formula under test. */
  function simulated(route: ExitRoute, timing: Timing, k: number): bigint | null {
    if (route === 'recovery') {
      // All k guardians vote for the same wallet right after the check-in.
      const voted = state(timing, k, { recVotes: GUARDIANS.map((_g, i) => (i < k ? NEW_WALLET : null)) });
      const r = engine.step(voted.state, deriveInputs(voted, T0, { candidate: NEW_WALLET }));
      if (r.next !== STATE_CODES.recovery) return null;
      const s = { ...voted, state: r.next, alarmAt: T0, recoveryTarget: NEW_WALLET };
      return computeTimeline(engine, s, T0, null).earliestRelease;
    }
    const inhVotes = route === 'heirs' && k > 0 ? (1 << k) - 1 : 0;
    return computeTimeline(engine, state(timing, k, { inhVotes }), T0, null).earliestRelease;
  }

  it.each(TIMINGS)('%s', (_label, timing) => {
    for (const k of [0, 1, 2, 3]) {
      const exit = exitTimes({ drill: false, guardians: GUARDIANS, k, recoveryEnabled: k > 0, timing });
      expect(exit.routes.map((r) => r.route).sort()).toEqual(
        k === 0 ? ['heirs'] : ['heirs', 'heirsFallback', 'recovery'],
      );
      for (const r of exit.routes)
        expect(simulated(r.route, timing, k), `${r.route} k=${k}`).toBe(T0 + BigInt(r.after));
      expect(exit.earliest).toEqual(exit.routes[0]);
      expect(exit.routes.every((r, i) => i === 0 || exit.routes[i - 1].after <= r.after)).toBe(true);
    }
  });
});

describe('exitTimes', () => {
  it('a Simple Drill pays the heirs 4 minutes after creation, with nobody signing', () => {
    expect(exitTimes({ drill: true, guardians: [], k: 0, recoveryEnabled: false, timing: PRESETS.drill })).toEqual({
      routes: [{ route: 'heirs', after: 240, guardians: 0 }],
      earliest: { route: 'heirs', after: 240, guardians: 0 },
      expiresAfter: 604_800,
    });
  });

  it('with recovery off, guardians only gate the heirs', () => {
    const exit = exitTimes({
      drill: false,
      guardians: GUARDIANS,
      k: 2,
      recoveryEnabled: false,
      timing: PRESETS.sixMonths,
    });
    expect(exit.routes.map((r) => r.route)).toEqual(['heirs', 'heirsFallback']);
  });

  it('leaves out what a Drill cannot reach before it expires', () => {
    const timing = { period: 86400, threshold: 6, window: 60 };
    const exit = exitTimes({ drill: true, guardians: GUARDIANS, k: 1, recoveryEnabled: true, timing });
    // heirs at 6 days + 1 minute; the fallback at 15 days is past the 7-day lifetime.
    expect(exit.routes).toEqual([
      { route: 'recovery', after: 60, guardians: 1 },
      { route: 'heirs', after: 6 * 86400 + 60, guardians: 1 },
    ]);
    expect(exitTimes({ drill: false, guardians: GUARDIANS, k: 1, recoveryEnabled: true, timing }).routes).toHaveLength(
      3,
    );
  });
});
