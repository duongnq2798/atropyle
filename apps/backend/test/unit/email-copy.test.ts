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
    }
    expect(Object.keys(COPY.vi.fragments).sort()).toEqual(Object.keys(COPY.en.fragments).sort());
  });

  it('keeps the same placeholders in every string of both languages', () => {
    // Field by field, as the web's i18n test checks every key: a VI preheader or note that dropped {{deadline}}
    // would pass the known-names check below, which catches only names that do not exist.
    const pairs: [string, string, string][] = [];
    for (const kind of EMAIL_KINDS) {
      const en = COPY.en.kinds[kind];
      const vi = COPY.vi.kinds[kind];
      for (const field of ['subject', 'preheader', 'eyebrow', 'heading', 'cta', 'note'] as const) {
        pairs.push([`${kind}.${field}`, en[field] ?? '', vi[field] ?? '']);
      }
      en.body.forEach((line, i) => {
        pairs.push([`${kind}.body.${i}`, line, vi.body[i] ?? '']);
      });
    }
    for (const group of ['roles', 'labels', 'footer', 'fragments'] as const) {
      const en: Record<string, string> = COPY.en[group];
      const vi: Record<string, string> = COPY.vi[group];
      expect(Object.keys(vi).sort(), group).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) pairs.push([`${group}.${key}`, en[key], vi[key] ?? '']);
    }
    const differ = pairs
      .filter(([, en, vi]) => slots(vi).sort().join() !== slots(en).sort().join())
      .map(([path, en, vi]) => `${path}: en {${slots(en).sort().join()}} vi {${slots(vi).sort().join()}}`);
    expect(differ, `strings whose VI placeholders differ from EN:\n${differ.join('\n')}`).toEqual([]);
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
