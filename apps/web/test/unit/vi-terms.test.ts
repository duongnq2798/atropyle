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

/** The banned words. Each pattern also catches lookalike spellings a later paste could bring in. */
const BANNED = [
  ['giải phóng', /giải\s+phóng/iu],
  ['check-in', /check[\s‐-―-]?in/iu],
  ['release', /\brelease/iu],
] as const;

/** No-break space, a double space, non-breaking hyphen, en dash. */
const LOOKALIKES = ['giải phóng', 'giải  phóng', 'check‑in', 'check–in', 'Check in'];

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
    const missed = LOOKALIKES.filter((s) => !BANNED.some(([, pattern]) => pattern.test(s)));
    expect(missed, 'lookalike spellings that no pattern catches').toEqual([]);
  });

  it('says "điểm danh" and "trao" somewhere, so the checks above cannot pass on an empty dictionary', () => {
    expect(offending(/điểm danh/iu).length, 'Vietnamese strings that say "điểm danh"').toBeGreaterThan(0);
    expect(offending(/\btrao\b/iu).length, 'Vietnamese strings that say "trao"').toBeGreaterThan(0);
  });
});
