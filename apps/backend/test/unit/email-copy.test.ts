import { describe, expect, it } from 'vitest';
import { COPY } from '../../src/email/copy';
import { EMAIL_KINDS, PLACEHOLDERS } from '../../src/email/kinds';
import { LANGS } from '../../src/types';

const strings = (o: unknown): string[] => {
  if (typeof o === 'string') return [o];
  if (Array.isArray(o)) return o.flatMap(strings);
  if (o !== null && typeof o === 'object') return Object.values(o).flatMap(strings);
  return [];
};
const slots = (s: string) => [...s.matchAll(/\{\{([A-Za-z]+)\}\}/g)].map((m) => m[1]);

describe('email copy (spec §9.4: every template in EN and VI)', () => {
  it('has every kind in both languages, with no empty string', () => {
    for (const lang of LANGS) {
      expect(Object.keys(COPY[lang].kinds).sort()).toEqual([...EMAIL_KINDS].sort());
      for (const s of strings(COPY[lang])) expect(s.trim()).not.toBe('');
    }
  });

  it('has the same shape in both languages', () => {
    for (const kind of EMAIL_KINDS) {
      const en = COPY.en.kinds[kind];
      const vi = COPY.vi.kinds[kind];
      expect(vi.body.length, kind).toBe(en.body.length);
      expect(vi.note === undefined, kind).toBe(en.note === undefined);
      expect(slots(vi.subject).sort(), kind).toEqual(slots(en.subject).sort());
      expect(slots(vi.body.join(' ')).sort(), kind).toEqual(slots(en.body.join(' ')).sort());
    }
    expect(Object.keys(COPY.vi.fragments).sort()).toEqual(Object.keys(COPY.en.fragments).sort());
  });

  it('translates every subject, heading and body', () => {
    for (const kind of EMAIL_KINDS) {
      const en = COPY.en.kinds[kind];
      const vi = COPY.vi.kinds[kind];
      expect(vi.subject, kind).not.toBe(en.subject);
      expect(vi.heading, kind).not.toBe(en.heading);
      expect(vi.body.join(' '), kind).not.toBe(en.body.join(' '));
    }
  });

  it('contains no character that HTML would escape, so templates print it verbatim', () => {
    for (const lang of LANGS) for (const s of strings(COPY[lang])) expect(s).not.toMatch(/[&<>"']/);
  });

  it('uses only known placeholders; fragments use only their own', () => {
    for (const lang of LANGS) {
      const c = COPY[lang];
      for (const s of strings([c.kinds, c.labels, c.footer, c.roles])) {
        for (const name of slots(s)) expect(PLACEHOLDERS as readonly string[]).toContain(name);
      }
      const f = c.fragments;
      for (const s of [
        f.alarmOwnerInheritance,
        f.alarmOwnerRecovery,
        f.alarmGuardianInheritance,
        f.alarmGuardianRecovery,
        f.releasedInheritance,
        f.releasedRecovery,
        f.summaryReleased,
        f.summaryNotReleased,
      ]) {
        expect(slots(s)).toEqual([]);
      }
      for (const s of [f.transferErc20, f.transferErc721, f.transferErc1155, f.transferUnknown]) {
        for (const name of slots(s)) expect(['amount', 'token', 'id', 'to']).toContain(name);
      }
    }
  });
});
