import { describe, expect, it } from 'vitest';
import { COPY } from '../../src/email/copy';

/** Every string in the copy, with its dotted path. */
function flatten(o: unknown, path: string): [string, string][] {
  if (typeof o === 'string') return [[path, o.normalize('NFC')]];
  if (Array.isArray(o)) return o.flatMap((v, i) => flatten(v, `${path}.${i}`));
  if (o !== null && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => flatten(v, `${path}.${k}`));
  return [];
}

const vi = flatten(COPY.vi, 'vi');

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

/** Paths whose "chủ ví" means the owner of a wallet, not of the vault. None today. */
const WALLET_OWNER_PATHS: readonly string[] = [];

/**
 * Ruling R20 (approved 24 Nov 2026): Vietnamese emails say "điểm danh" for check-in and "trao" for release.
 * "giải phóng" sounds cold to a grieving family, and "check-in" and "release" are English loanwords.
 */
describe('Vietnamese email words for check-in and release (ruling R20)', () => {
  it('reads the Vietnamese copy', () => {
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

  it('the released email does not say the assets already moved: distribute pays them out later', () => {
    const { subject, eyebrow, heading } = COPY.vi.kinds.released;
    expect([subject, eyebrow, heading].filter((s) => /đã trao/iu.test(s.normalize('NFC')))).toEqual([]);
    const notYet = [subject, eyebrow, heading].filter((s) => !/tới lúc .*trao tài sản/iu.test(s.normalize('NFC')));
    expect(notYet, 'released lines that do not say the time has come to hand over the assets').toEqual([]);
  });

  it('every alarm email says "quá hạn điểm danh", not "lỡ hạn"', () => {
    const hits = offending(/lỡ hạn/iu);
    expect(hits, `Vietnamese strings that say "lỡ hạn":\n${hits.join('\n')}`).toEqual([]);
    const alarms = {
      alarmOwnerInheritance: COPY.vi.fragments.alarmOwnerInheritance,
      alarmGuardianInheritance: COPY.vi.fragments.alarmGuardianInheritance,
      'alarm-heir.body.0': COPY.vi.kinds['alarm-heir'].body[0],
    };
    const missing = Object.entries(alarms).filter(([, s]) => !/quá hạn điểm danh/iu.test(s.normalize('NFC')));
    expect(missing, 'alarm strings that do not say "quá hạn điểm danh"').toEqual([]);
  });

  /**
   * The web calls the vault's owner "chủ vault", so the emails do too. Every "chủ ví" in the copy meant the vault's
   * owner. A sentence that really means the owner of a wallet, as opposed to the vault, may say "chủ ví": list its path
   * in WALLET_OWNER_PATHS.
   */
  it('emails call the owner "chủ vault", as the web does', () => {
    const hits = offending(/chủ ví/iu).filter((hit) => !WALLET_OWNER_PATHS.some((path) => hit.startsWith(`${path}: `)));
    expect(hits, `Vietnamese strings that say "chủ ví":\n${hits.join('\n')}`).toEqual([]);
    expect(COPY.vi.roles.owner).toBe('chủ vault');
  });

  it('says "điểm danh" and "trao" somewhere, so the checks above cannot pass on empty copy', () => {
    expect(offending(/điểm danh/iu).length, 'Vietnamese strings that say "điểm danh"').toBeGreaterThan(0);
    expect(offending(/\btrao\b/iu).length, 'Vietnamese strings that say "trao"').toBeGreaterThan(0);
  });
});
