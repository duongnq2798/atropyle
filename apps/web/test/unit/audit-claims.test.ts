import { describe, expect, it } from 'vitest';
import type { Messages } from '../../src/i18n/core';

/** Vite's `import.meta.glob`, which vitest compiles away. Typed here, as in i18n.test.ts and vi-terms.test.ts. */
type EagerGlob = <T>(pattern: string, options: { eager: true }) => Record<string, T>;

/** Every string in a dictionary, with its dotted path. */
function flatten(o: unknown, path: string): [string, string][] {
  if (typeof o === 'string') return [[path, o.normalize('NFC')]];
  if (Array.isArray(o)) return o.flatMap((v, i) => flatten(v, `${path}.${i}`));
  if (o !== null && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => flatten(v, `${path}.${k}`));
  return [];
}

const mods = (import.meta as ImportMeta & { glob: EagerGlob }).glob<{ messages: Messages<string> }>(
  '../../src/**/*.messages.ts',
  { eager: true },
);
const strings = (lang: 'en' | 'vi') =>
  Object.entries(mods).flatMap(([file, mod]) => flatten(mod.messages[lang], `${file.replace(/^.*\//, '')} ${lang}`));

/** "audited" other than in "unaudited" or "not been audited". */
const EN_AUDITED = /(?<!un)(?<!not\s+been\s+)audited/iu;
/** "kiểm toán" (audit) other than in "chưa kiểm toán" or "chưa được kiểm toán" (not audited). */
const VI_AUDITED = /(?<!chưa\s+(?:được\s+)?)kiểm\s+toán/iu;

/**
 * Atropyle has not been audited, and the site says so: the proof line, the footer, common.beta and create.realBanner
 * (ruling R21). A string that calls the vault code "audited" contradicts them a few lines away, on a product that
 * holds real funds.
 */
describe('no copy claims an audit (ruling R21)', () => {
  it('reads every messages file', () => {
    expect(strings('en').length).toBeGreaterThan(0);
    expect(strings('vi').length).toBeGreaterThan(0);
  });

  it('the patterns tell a claim from a disclosure', () => {
    expect(['the audited vault code', 'Audited by a firm'].filter((s) => !EN_AUDITED.test(s))).toEqual([]);
    expect(['unaudited', 'has not been audited'].filter((s) => EN_AUDITED.test(s))).toEqual([]);
    expect(['mã vault đã kiểm toán'].filter((s) => !VI_AUDITED.test(s))).toEqual([]);
    expect(['chưa kiểm toán', 'chưa được kiểm toán'].filter((s) => VI_AUDITED.test(s))).toEqual([]);
  });

  it('says "audited" only as "unaudited" or "not been audited"', () => {
    const hits = strings('en')
      .filter(([, s]) => EN_AUDITED.test(s))
      .map(([path, s]) => `${path}: ${s}`);
    expect(hits, `English strings that claim an audit:\n${hits.join('\n')}`).toEqual([]);
  });

  it('says "kiểm toán" only as "chưa kiểm toán" or "chưa được kiểm toán"', () => {
    const hits = strings('vi')
      .filter(([, s]) => VI_AUDITED.test(s))
      .map(([path, s]) => `${path}: ${s}`);
    expect(hits, `Vietnamese strings that claim an audit:\n${hits.join('\n')}`).toEqual([]);
  });
});
