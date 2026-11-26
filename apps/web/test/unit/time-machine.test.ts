import {
  DRILL_LIFETIME_SECONDS,
  type EvalState,
  evalStateOf,
  exitTimes,
  modelEngine,
  STATE_CODES,
} from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { frameAt, NEW_WALLET, type ScenarioRun, scenarios } from '../../src/flows/impl/time-machine';
import { fixtureSnapshot, PEOPLE } from './fixtures';

const engine = modelEngine();
// Timing 60/2/120, last check-in at 990, k = 2 of [g1, g2, heirB], recovery on; the Drill was made at 1 000.
const s = evalStateOf(fixtureSnapshot());
const END = 1_000n + BigInt(DRILL_LIFETIME_SECONDS);
const steps = (r: ScenarioRun) => r.moments.map((m) => [m.kind, m.at, m.state]);
function byId(runs: ScenarioRun[], id: ScenarioRun['id']): ScenarioRun {
  const run = runs.find((r) => r.id === id);
  if (!run) throw new Error(`no ${id} scenario`);
  return run;
}

describe('time machine', () => {
  it('runs the three scenarios through the policy engine', () => {
    const [silent, confirm, recover] = scenarios(engine, s, 1_000n, END, true);
    expect(steps(silent)).toEqual([
      ['now', 1_000n, 'active'],
      ['alarm', 1_110n, 'grace'],
      ['release', 1_890n, 'releasedInherit'],
    ]);
    expect(steps(confirm)).toEqual([
      ['now', 1_000n, 'active'],
      ['alarm', 1_110n, 'grace'],
      ['attest', 1_111n, 'grace'],
      ['attest', 1_112n, 'grace'],
      ['release', 1_230n, 'releasedInherit'],
    ]);
    expect(steps(recover)).toEqual([
      ['now', 1_000n, 'active'],
      ['vote', 1_001n, 'active'],
      ['vote', 1_002n, 'recovery'],
      ['release', 1_122n, 'releasedRecover'],
    ]);
    expect(recover.moments.map((m) => m.who)).toEqual([null, PEOPLE.g1, PEOPLE.g2, null]);
    expect(NEW_WALLET).toBe('0x7e7e7e7E7e7E7e7e7e7E7e7e7e7E7e7e7e7e7e7E');
    // One period after the last change; the Drill's end lies far beyond and is left out of the range.
    expect(silent.end).toBe(1_950n);
    expect(confirm.end).toBe(1_290n);
    expect(recover.end).toBe(1_182n);
    expect(frameAt(recover, 1_121n).state).toBe('recovery');
    expect(frameAt(recover, 1_122n).state).toBe('releasedRecover');
    expect(frameAt(silent, 999n).kind).toBe('now');
  });

  it('a released or expired vault has a single frame', () => {
    const released = { ...s, state: STATE_CODES.releasedInherit };
    for (const runs of [scenarios(engine, released, 1_000n, null, false), scenarios(engine, s, END, END, true)]) {
      expect(runs).toHaveLength(1);
      const [run] = runs;
      expect(run.moments).toHaveLength(1);
      expect(run.end).toBe(run.moments[0].at);
      expect(frameAt(run, run.end + 10_000n)).toBe(run.moments[0]);
    }
  });

  it('offers only what the vault allows, the two new scenarios after the three old ones', () => {
    const ids = (x: EvalState) => scenarios(engine, x, 1_000n, null, false).map((r) => r.id);
    expect(ids({ ...s, k: 0, guardians: [], recVotes: [] })).toEqual(['silent']);
    expect(ids({ ...s, recoveryEnabled: false })).toEqual(['silent', 'confirm', 'returns']);
    expect(ids(s)).toEqual(['silent', 'confirm', 'recover', 'returns', 'recoverBlocked']);
  });

  it('releases exactly when exitTimes says (7B-main-sync)', () => {
    const ex = exitTimes({ drill: true, guardians: s.guardians, k: s.k, recoveryEnabled: true, timing: s.timing });
    const routeAfter = (route: 'heirs' | 'heirsFallback' | 'recovery'): bigint => {
      const r = ex.routes.find((x) => x.route === route);
      if (!r) throw new Error(`no ${route} route`);
      return BigInt(r.after);
    };
    const released = (r: ScenarioRun) => r.moments.find((m) => m.kind === 'release')?.at;
    const last = (r: ScenarioRun, kind: 'vote' | 'checkIn') =>
      r.moments.filter((m) => m.kind === kind).at(-1)?.at ?? 0n;
    const runs = scenarios(engine, s, 1_000n, END, true);
    // Silence: no confirmation, so the 15-period fallback. Confirmed: T·P + W. Recovery: W after the last vote.
    expect(released(byId(runs, 'silent'))).toBe(s.lastAlive + routeAfter('heirsFallback'));
    expect(released(byId(runs, 'confirm'))).toBe(s.lastAlive + routeAfter('heirs'));
    expect(released(byId(runs, 'recover'))).toBe(last(byId(runs, 'recover'), 'vote') + routeAfter('recovery'));
    // After the owner's check-in the count starts again from it, and nobody confirms the second alarm.
    expect(released(byId(runs, 'returns'))).toBe(last(byId(runs, 'returns'), 'checkIn') + routeAfter('heirsFallback'));
    expect(released(byId(runs, 'recoverBlocked'))).toBe(
      last(byId(runs, 'recoverBlocked'), 'checkIn') + routeAfter('heirsFallback'),
    );
  });

  it('returns: the confirmations, the owner back at alarm + W/2, then silence', () => {
    const returns = byId(scenarios(engine, s, 1_000n, END, true), 'returns');
    expect(steps(returns)).toEqual([
      ['now', 1_000n, 'active'],
      ['alarm', 1_110n, 'grace'],
      ['attest', 1_111n, 'grace'],
      ['attest', 1_112n, 'grace'],
      ['checkIn', 1_170n, 'active'],
      ['alarm', 1_290n, 'grace'],
      ['release', 2_070n, 'releasedInherit'],
    ]);
    expect(returns.moments[4].who).toBe(PEOPLE.owner);
    expect(returns.end).toBe(2_130n);
  });

  it('recoverBlocked: the votes, the owner one second after the last one, then silence', () => {
    const blocked = byId(scenarios(engine, s, 1_000n, END, true), 'recoverBlocked');
    expect(steps(blocked)).toEqual([
      ['now', 1_000n, 'active'],
      ['vote', 1_001n, 'active'],
      ['vote', 1_002n, 'recovery'],
      ['checkIn', 1_003n, 'active'],
      ['alarm', 1_123n, 'grace'],
      ['release', 1_903n, 'releasedInherit'],
    ]);
    expect(blocked.end).toBe(1_963n);
  });

  it('takes the times of ScenarioOptions', () => {
    const opts = { confirmAt: 1_150n, votesAt: [1_010n, 1_020n], returnAt: 1_180n, blockAt: 1_060n };
    const runs = scenarios(engine, s, 1_000n, END, true, opts);
    expect(steps(byId(runs, 'silent'))).toEqual(steps(byId(scenarios(engine, s, 1_000n, END, true), 'silent')));
    expect(steps(byId(runs, 'confirm')).slice(2)).toEqual([
      ['attest', 1_150n, 'grace'],
      ['attest', 1_151n, 'grace'],
      ['release', 1_230n, 'releasedInherit'],
    ]);
    expect(steps(byId(runs, 'recover')).slice(1)).toEqual([
      ['vote', 1_010n, 'active'],
      ['vote', 1_020n, 'recovery'],
      ['release', 1_140n, 'releasedRecover'],
    ]);
    expect(steps(byId(runs, 'returns')).slice(4)).toEqual([
      ['checkIn', 1_180n, 'active'],
      ['alarm', 1_300n, 'grace'],
      ['release', 2_080n, 'releasedInherit'],
    ]);
    expect(steps(byId(runs, 'recoverBlocked')).slice(3)).toEqual([
      ['checkIn', 1_060n, 'active'],
      ['alarm', 1_180n, 'grace'],
      ['release', 1_960n, 'releasedInherit'],
    ]);
  });

  it('moves a time that comes too early to the earliest it can be', () => {
    const runs = scenarios(engine, s, 1_000n, END, true, {
      confirmAt: 900n,
      votesAt: [1_010n, 1_005n],
      returnAt: 1_000n,
      blockAt: 1_000n,
    });
    expect(steps(byId(runs, 'confirm')).slice(2, 4)).toEqual([
      ['attest', 1_111n, 'grace'],
      ['attest', 1_112n, 'grace'],
    ]);
    expect(steps(byId(runs, 'recover')).slice(1, 3)).toEqual([
      ['vote', 1_010n, 'active'],
      ['vote', 1_011n, 'recovery'],
    ]);
    // Back one second after the alarm: before any confirmation, so none is kept.
    expect(steps(byId(runs, 'returns')).slice(1, 3)).toEqual([
      ['alarm', 1_110n, 'grace'],
      ['checkIn', 1_111n, 'active'],
    ]);
    expect(steps(byId(runs, 'recoverBlocked'))[3]).toEqual(['checkIn', 1_012n, 'active']);
  });

  it('a return before the confirmations keeps none of them ("I come back" alone, 7C T6)', () => {
    const returns = byId(scenarios(engine, s, 1_000n, END, true, { confirmAt: 1_200n, returnAt: 1_150n }), 'returns');
    expect(steps(returns)).toEqual([
      ['now', 1_000n, 'active'],
      ['alarm', 1_110n, 'grace'],
      ['checkIn', 1_150n, 'active'],
      ['alarm', 1_270n, 'grace'],
      ['release', 2_050n, 'releasedInherit'],
    ]);
  });

  it('starts from where the vault is: in grace, only the missing confirmations', () => {
    const grace = { ...s, state: STATE_CODES.grace, alarmAt: 1_110n, inhVotes: 1 };
    const runs = scenarios(engine, grace, 1_150n, END, true);
    expect(runs.map((r) => r.id)).toEqual(['silent', 'confirm', 'recover', 'returns', 'recoverBlocked']);
    expect(steps(byId(runs, 'confirm'))).toEqual([
      ['now', 1_150n, 'grace'],
      ['attest', 1_151n, 'grace'],
      ['release', 1_230n, 'releasedInherit'],
    ]);
    expect(byId(runs, 'confirm').moments[1].who).toBe(PEOPLE.g2);
    // The return is half the window after the alarm that was raised at 1 110, not after now.
    expect(steps(byId(runs, 'returns'))[2]).toEqual(['checkIn', 1_170n, 'active']);
  });

  it('a recovery under way offers only silence', () => {
    const pending = {
      ...s,
      state: STATE_CODES.recovery,
      alarmAt: 1_002n,
      recoveryTarget: NEW_WALLET,
      recVotes: [NEW_WALLET, NEW_WALLET, null],
    };
    const runs = scenarios(engine, pending, 1_050n, END, true);
    expect(runs.map((r) => r.id)).toEqual(['silent']);
    expect(steps(runs[0])).toEqual([
      ['now', 1_050n, 'recovery'],
      ['release', 1_122n, 'releasedRecover'],
    ]);
  });

  it('says, at each moment, what comes next if nobody signs', () => {
    const [silent, confirm, recover] = scenarios(engine, s, 1_000n, END, true);
    const outlook = (r: ScenarioRun) => r.moments.map((m) => [m.alarmAt, m.releaseAt]);
    expect(outlook(silent)).toEqual([
      [1_110n, 1_890n],
      [1_110n, 1_890n],
      [null, 1_890n],
    ]);
    expect(outlook(confirm)).toEqual([
      [1_110n, 1_890n],
      [1_110n, 1_890n],
      [1_110n, 1_890n],
      [1_110n, 1_230n],
      [null, 1_230n],
    ]);
    expect(outlook(recover)).toEqual([
      [1_110n, 1_890n],
      [1_110n, 1_890n],
      [1_002n, 1_122n],
      [null, 1_122n],
    ]);
  });

  it('a Drill that ends before anything releases ends at its end', () => {
    const slow = { ...s, lastAlive: 1_000n, timing: { period: 86_400, threshold: 6, window: 86_400 } };
    const [silent] = scenarios(engine, slow, 1_000n, END, true);
    expect(steps(silent)).toEqual([
      ['now', 1_000n, 'active'],
      ['alarm', 519_400n, 'grace'],
      ['drillExpiry', END, 'grace'],
    ]);
    expect(silent.end).toBe(END);
  });
});
