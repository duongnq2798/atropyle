import { describe, expect, it } from 'vitest';
import { standingRole, standingSentence } from '../../src/app/vault/standing';
import { translate } from '../../src/i18n/core';
import { chainDate } from '../../src/lib/when';
import { messages } from '../../src/messages/standing.messages';
import { messages as vault } from '../../src/messages/vault.messages';
import { fixtureSnapshot } from './fixtures';

const base = fixtureSnapshot().status; // active, lastAlive 990, lateAt 1050, expiresAt 605_800
const W = { alarmAt: 1_100n, windowEndsAt: 1_220n };
const NBSP = String.fromCharCode(0xa0);
/** The one breakable space of a date with its time: after the comma before "20:41 UTC". */
const BETWEEN = new RegExp(`, (?=[0-9]{2}:[0-9]{2}${NBSP}UTC$)`);

/** [case, status over the base, key suffix, the moment `date` names] */
const CASES = [
  ['active', {}, 'Active', 990n],
  ['late', { pending: 'grace' }, 'Late', 1_050n],
  ['grace', { state: 'grace', pending: 'grace', ...W }, 'Grace', 1_100n],
  ['due', { state: 'grace', pending: 'releasedInherit', ...W }, 'Due', 1_220n],
  ['recovery', { state: 'recovery', pending: 'recovery', ...W }, 'Recovery', 1_100n],
  ['recoveryDue', { state: 'recovery', pending: 'releasedRecover', ...W }, 'RecoveryDue', 1_220n],
  [
    'releasedInherit',
    { state: 'releasedInherit', pending: 'releasedInherit', releasedAt: 1_300n },
    'ReleasedInherit',
    1_300n,
  ],
  [
    'releasedRecover',
    { state: 'releasedRecover', pending: 'releasedRecover', releasedAt: 1_300n },
    'ReleasedRecover',
    1_300n,
  ],
  ['expired', { expired: true }, 'Expired', 605_800n],
] as const;

describe('standingSentence', () => {
  for (const [name, over, suffix, at] of CASES) {
    for (const role of ['owner', 'guest'] as const) {
      for (const lang of ['en', 'vi'] as const) {
        it(`${role} · ${name} · ${lang}`, () => {
          const s = standingSentence({ role, status: { ...base, ...over }, chainNow: 1_000n, lang, drill: true });
          if (!s) throw new Error('no sentence');
          expect(s.key).toBe(`${role}${suffix}`);
          expect(String(s.params.date).replaceAll(NBSP, ' ')).toBe(chainDate(at, lang, true));
          // At 390 px a date never breaks inside "26 tháng 11, 2026" or "20:41 UTC": only after the comma between them.
          for (const v of Object.values(s.params).map(String)) {
            const [day, time = ''] = v.split(BETWEEN);
            expect(day, v).not.toContain(' ');
            expect(time, v).not.toContain(' ');
            expect(time, v).toMatch(/UTC$/);
          }
          const text = translate(messages, lang, s.key, s.params);
          expect(text, 'every placeholder filled').not.toMatch(/\{\w+\}/);
        });
      }
    }
  }

  it('has no sentence for heirs and guardians: they read their own tab', () => {
    expect(standingRole(['owner'])).toBe('owner');
    expect(standingRole([])).toBe('guest');
    expect(standingRole(['heir'])).toBeNull();
    expect(standingRole(['guardian', 'heir'])).toBeNull();
    expect(standingSentence({ role: null, status: base, chainNow: 1_000n, lang: 'en', drill: true })).toBeNull();
  });

  it('gives the time of day to a Drill and to a moment within two days, a date alone otherwise', () => {
    const far = { ...base, lastAlive: 1_000n - 10n * 86_400n };
    const s = standingSentence({ role: 'guest', status: far, chainNow: 1_000n, lang: 'en', drill: false });
    expect(s?.params.date).not.toContain('UTC');
    const near = standingSentence({ role: 'guest', status: base, chainNow: 1_000n, lang: 'en', drill: false });
    expect(near?.params.date).toContain('UTC');
  });

  it('leaves "the rules now allow" to the moment line under the thread: said once (review fix 2)', () => {
    const due = [
      ['Due', 'predictedReleasedInherit'],
      ['RecoveryDue', 'predictedReleasedRecover'],
    ] as const;
    for (const lang of ['en', 'vi'] as const) {
      for (const [suffix, moment] of due) {
        const line = translate(vault, lang, moment, {});
        const rules = line.slice(0, line.indexOf('.') + 1);
        for (const role of ['owner', 'guest'] as const) {
          const text = translate(messages, lang, `${role}${suffix}`, { date: 'D' });
          expect(text).toMatch(/^[^.]*D\.$/);
          expect(text).not.toContain(rules.slice(0, 20));
        }
      }
    }
  });
});
