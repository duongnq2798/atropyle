import { recipientsFor, type StateName } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { headerThread } from '../../src/app/vault/header-thread';
import { letterOpening } from '../../src/app/vault/letter-opening';
import { branchWeights, letterThread } from '../../src/app/vault/letter-thread';
import { keepDate } from '../../src/app/vault/standing';
import { chainDate } from '../../src/lib/when';
import { fixtureSnapshot, fixtureTimeline } from './fixtures';

function status(state: StateName, pending: StateName, extra: Record<string, unknown> = {}) {
  const s = fixtureSnapshot().status;
  return { ...s, state, pending, ...extra };
}

describe('letterOpening', () => {
  const cases: [StateName, StateName, boolean, string][] = [
    ['active', 'active', false, 'openActive'],
    ['active', 'grace', false, 'openSilent'],
    ['grace', 'grace', false, 'openAlarm'],
    ['grace', 'releasedInherit', false, 'openDue'],
    ['recovery', 'recovery', false, 'openRecovery'],
    ['releasedInherit', 'releasedInherit', false, 'openReleased'],
    ['releasedRecover', 'releasedRecover', false, 'openReleasedRecover'],
    ['recovery', 'recovery', true, 'openRecoverPending'],
    ['recovery', 'releasedRecover', true, 'openRecoverDue'],
    ['releasedRecover', 'releasedRecover', true, 'openRecoverReleased'],
  ];
  it.each(cases)('%s (pending %s, recover %s) opens with %s', (state, pending, recover, key) => {
    const s = status(state, pending, { alarmAt: 1060n, windowEndsAt: 1200n, releasedAt: 1230n });
    expect(letterOpening(s, recover, 'en').key).toBe(key);
  });

  it('an expired Drill says so whatever its state', () => {
    expect(letterOpening(status('grace', 'grace', { expired: true }), false, 'en').key).toBe('openExpired');
  });

  // Each moment on its own day, so a date taken from the wrong field cannot pass (Ruling 31: grace reads lastAlive).
  const DAY = 86_400n;
  const T = {
    lastAlive: DAY * 400n + 3_600n,
    alarmAt: DAY * 403n + 3_600n,
    windowEndsAt: DAY * 405n + 3_600n,
    releasedAt: DAY * 407n + 3_600n,
    blockTimestamp: DAY * 409n + 3_600n,
  };
  const dated: [StateName, StateName, boolean, string, keyof typeof T][] = [
    ['active', 'active', false, 'openActive', 'lastAlive'],
    ['active', 'grace', false, 'openSilent', 'lastAlive'],
    ['grace', 'grace', false, 'openAlarm', 'lastAlive'],
    ['grace', 'releasedInherit', false, 'openDue', 'lastAlive'],
    ['releasedInherit', 'releasedInherit', false, 'openReleased', 'releasedAt'],
    ['releasedRecover', 'releasedRecover', true, 'openRecoverReleased', 'releasedAt'],
    ['recovery', 'recovery', true, 'openRecoverPending', 'windowEndsAt'],
  ];
  it.each(dated)('%s (pending %s, recover %s): %s is dated by %s', (state, pending, recover, key, field) => {
    for (const lang of ['en', 'vi'] as const) {
      const o = letterOpening(status(state, pending, T), recover, lang);
      expect(o.key).toBe(key);
      expect(o.params.date).toBe(keepDate(chainDate(T[field], lang, true)));
    }
  });

  it('once the reader has received, the released letter says the share reached their wallet', () => {
    const released = status('releasedInherit', 'releasedInherit', T);
    expect(letterOpening(released, false, 'en', false).key).toBe('openReleased');
    const o = letterOpening(released, false, 'en', true);
    expect(o.key).toBe('openDelivered');
    expect(o.params.date).toBe(keepDate(chainDate(T.releasedAt, 'en', true)));
    const rec = letterOpening(status('releasedRecover', 'releasedRecover', T), true, 'en', true);
    expect(rec.key).toBe('openRecoverDelivered');
    expect(rec.params.date).toBe(keepDate(chainDate(T.releasedAt, 'en', true)));
    // Received means nothing before the vault passed to the reader.
    expect(letterOpening(status('grace', 'releasedInherit', T), false, 'en', true).key).toBe('openDue');
    expect(letterOpening(status('releasedRecover', 'releasedRecover', T), false, 'en', true).key).toBe(
      'openReleasedRecover',
    );
  });

  it('dates are chain time with the time of day, kept whole with no-break spaces', () => {
    const o = letterOpening(status('active', 'active'), false, 'vi');
    // lastAlive 990 is 1 January 1970, 00:16:30 UTC.
    expect(o.params.date).toMatch(/1970/);
    expect(o.params.date).toMatch(/UTC/);
    expect(o.params.date).toContain('\u00A0');
  });
});

describe('letterThread', () => {
  const snap = fixtureSnapshot();
  // Coverage 500000 of USDT0, heirs 70 % and 30 %: 350000 and 150000. The NFT has no coverage.
  const inherit = recipientsFor(snap, 'releasedInherit', null);
  const thread = (
    st: StateName,
    pending: StateName,
    reader: { heir: number; recover: boolean },
    extra: Record<string, unknown> = {},
  ) => letterThread(snap.config, status(st, pending, extra), fixtureTimeline(), 1000n, reader, inherit);

  it('ties the last check-in as a knot on the header axis, and highlights the reader branch', () => {
    const t = thread('active', 'active', { heir: 1, recover: false });
    const h = headerThread(snap.config, snap.status, fixtureTimeline(), 1000n);
    expect(t.input.axis?.marks).toEqual([snap.status.lastAlive]);
    expect(t.input.axis?.from).toBe(h.input.axis?.from);
    expect(t.input.axis?.releaseAt).toBe(h.input.axis?.releaseAt);
    expect(t.input.highlight).toBe(1);
  });

  it('before release an heir reads the inheritance ahead, dashed: the only state that draws branches', () => {
    const t = thread('active', 'active', { heir: 0, recover: false });
    expect([t.state, t.predicted, t.input.predicted]).toEqual(['releasedInherit', true, true]);
    expect(thread('active', 'grace', { heir: 0, recover: false }).state).toBe('releasedInherit');
    expect(thread('grace', 'releasedInherit', { heir: 0, recover: false }).state).toBe('releasedInherit');
  });

  it('weighs the branches by what each heir would receive now, as a share of each asset', () => {
    const w = thread('active', 'active', { heir: 0, recover: false }).input.branches ?? [];
    expect(w).toHaveLength(2);
    expect(w[0]).toBeCloseTo(0.7, 6);
    expect(w[1]).toBeCloseTo(0.3, 6);
  });

  it('falls back to the plan basis points when nothing is covered', () => {
    expect(branchWeights(snap.config.heirs, [])).toEqual([7000, 3000]);
  });

  it('once released draws the stored state, solid', () => {
    const inh = thread('releasedInherit', 'releasedInherit', { heir: 0, recover: false }, { releasedAt: 1230n });
    expect([inh.state, inh.predicted]).toEqual(['releasedInherit', false]);
    const rec = thread('releasedRecover', 'releasedRecover', { heir: 0, recover: false }, { releasedAt: 1230n });
    expect([rec.state, rec.predicted]).toEqual(['releasedRecover', false]);
  });

  it('while a recovery is under way, or allowed, an heir sees the header thread: no branches that may never grow', () => {
    for (const [st, pending] of [
      ['recovery', 'recovery'],
      ['recovery', 'releasedRecover'],
      ['active', 'recovery'],
    ] as [StateName, StateName][]) {
      const s = status(st, pending);
      const h = headerThread(snap.config, s, fixtureTimeline(), 1000n);
      const t = letterThread(snap.config, s, fixtureTimeline(), 1000n, { heir: 0, recover: false }, inherit);
      expect([t.state, t.predicted], `${st}/${pending}`).toEqual([h.state, h.predicted]);
    }
  });

  it('the recovery wallet reads its own course, dashed until released, with no branch of its own', () => {
    const pending = thread('recovery', 'recovery', { heir: -1, recover: true });
    expect([pending.state, pending.predicted, pending.input.highlight]).toEqual(['releasedRecover', true, undefined]);
    const done = thread('releasedRecover', 'releasedRecover', { heir: -1, recover: true }, { releasedAt: 1230n });
    expect([done.state, done.predicted]).toEqual(['releasedRecover', false]);
    // A recovery wallet that is also an heir: still no highlight.
    expect(thread('recovery', 'recovery', { heir: 1, recover: true }).input.highlight).toBeUndefined();
  });

  it('an expired Drill curls up whoever reads it', () => {
    for (const recover of [false, true]) {
      const t = thread('grace', 'releasedInherit', { heir: 0, recover }, { expired: true });
      expect([t.state, t.predicted]).toEqual(['expired', false]);
    }
  });
});
