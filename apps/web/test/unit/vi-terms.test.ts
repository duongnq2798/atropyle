import { describe, expect, it } from 'vitest';
import type { Messages } from '../../src/i18n/core';

/**
 * Vite's `import.meta.glob`, which vitest compiles away. Typed here, as in i18n.test.ts, rather than through
 * `vite/client`, a type library that would type `import.meta.env` and `import.meta.glob` in all of src.
 */
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
const vi = Object.entries(mods).flatMap(([file, mod]) => flatten(mod.messages.vi, `${file.replace(/^.*\//, '')} vi`));

const offending = (pattern: RegExp) => vi.filter(([, s]) => pattern.test(s)).map(([path, s]) => `${path}: ${s}`);

/**
 * The banned words. Each pattern also catches lookalike spellings a later paste could bring in: any whitespace, the
 * no-break space named outright, an ASCII hyphen, and U+2010 to U+2015 (hyphen to horizontal bar). The escapes keep
 * every character visible.
 */
const BANNED = [
  ['giải phóng', /giải[\s\u00A0]+phóng/iu],
  ['check-in', /check[\s\-\u2010-\u2015]?in/iu],
  ['release', /\brelease/iu],
] as const;

/**
 * Spellings a later paste could bring in, written as escapes so that each one is visible: a no-break space, a double
 * space, a tab, decomposed (NFD) letters, capitals, a plain hyphen, U+2010 to U+2015 (hyphen, non-breaking hyphen,
 * figure dash, en dash, em dash, horizontal bar), no separator at all, and an inflected "release".
 */
const LOOKALIKES = [
  'giải\u00A0phóng',
  'giải  phóng',
  'giải\tphóng',
  'giải phóng'.normalize('NFD'),
  'GIẢI PHÓNG',
  'check-in',
  'check\u2010in',
  'check\u2011in',
  'check\u2012in',
  'check\u2013in',
  'check\u2014in',
  'check\u2015in',
  'Check\u00A0in',
  'checkin',
  'CHECK-IN',
  'Released',
];

/**
 * Ruling R20 (approved 24 Nov 2026): Vietnamese copy says "điểm danh" for check-in and "trao" for release.
 * "giải phóng" sounds cold to a grieving family, and "check-in" and "release" are English loanwords.
 */
describe('Vietnamese words for check-in and release (ruling R20)', () => {
  it('reads every messages file', () => {
    expect(Object.keys(mods).length).toBeGreaterThan(0);
    expect(vi.length).toBeGreaterThan(0);
  });

  for (const [name, pattern] of BANNED) {
    it(`no Vietnamese string says "${name}"`, () => {
      const hits = offending(pattern);
      expect(hits, `Vietnamese strings that say "${name}":\n${hits.join('\n')}`).toEqual([]);
    });
  }

  it('the banned words also match their lookalike spellings', () => {
    // Through flatten, like the copy above, so decomposed letters are normalised before the patterns run.
    const missed = flatten(LOOKALIKES, 'lookalike')
      .filter(([, s]) => !BANNED.some(([, pattern]) => pattern.test(s)))
      .map(([path, s]) => `${path}: ${s}`);
    expect(missed, 'lookalike spellings that no pattern catches').toEqual([]);
  });

  /**
   * Ruling R22: a released vault still holds its assets until distribute runs, so its state label says whom the vault
   * now belongs to ("Thuộc về …"), not that the assets were handed over ("Đã trao …").
   */
  it('the released state labels do not say the assets already moved: distribute pays them out later', () => {
    const labels = vi.filter(([path]) => /^labels\.messages\.ts vi\.stateReleased(Inherit|Recover)$/u.test(path));
    expect(labels.map(([path]) => path)).toHaveLength(2);
    const said = labels.filter(([, s]) => /đã trao/iu.test(s)).map(([path, s]) => `${path}: ${s}`);
    expect(said, 'released state labels that say "đã trao"').toEqual([]);
    const notOwned = labels.filter(([, s]) => !/^Thuộc về /u.test(s)).map(([path, s]) => `${path}: ${s}`);
    expect(notOwned, 'released state labels that do not say "Thuộc về"').toEqual([]);
  });

  it('says "điểm danh" and "trao" somewhere, so the checks above cannot pass on an empty dictionary', () => {
    expect(offending(/điểm danh/iu).length, 'Vietnamese strings that say "điểm danh"').toBeGreaterThan(0);
    expect(offending(/\btrao\b/iu).length, 'Vietnamese strings that say "trao"').toBeGreaterThan(0);
  });
});
