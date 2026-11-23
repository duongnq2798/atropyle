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

/** The banned words. Each pattern also catches lookalike spellings a later paste could bring in. */
const BANNED = [
  ['giải phóng', /giải\s+phóng/iu],
  ['check-in', /check[\s‐-―-]?in/iu],
  ['release', /\brelease/iu],
] as const;

/** No-break space, a double space, non-breaking hyphen, en dash. */
const LOOKALIKES = ['giải phóng', 'giải  phóng', 'check‑in', 'check–in', 'Check in'];

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
    const missed = LOOKALIKES.filter((s) => !BANNED.some(([, pattern]) => pattern.test(s)));
    expect(missed, 'lookalike spellings that no pattern catches').toEqual([]);
  });

  it('the released email does not say the assets already moved: distribute pays them out later', () => {
    const { subject, eyebrow, heading } = COPY.vi.kinds.released;
    expect([subject, eyebrow, heading].filter((s) => /đã trao/iu.test(s.normalize('NFC')))).toEqual([]);
  });

  it('says "điểm danh" and "trao" somewhere, so the checks above cannot pass on empty copy', () => {
    expect(offending(/điểm danh/iu).length, 'Vietnamese strings that say "điểm danh"').toBeGreaterThan(0);
    expect(offending(/\btrao\b/iu).length, 'Vietnamese strings that say "trao"').toBeGreaterThan(0);
  });
});
