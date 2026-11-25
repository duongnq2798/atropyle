// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Messages } from '../../src/i18n/core';
import { FAMILY_NAMES, missingGlyphs } from '../helpers/glyphs';

/** Vite's `import.meta.glob`, typed here as in i18n.test.ts and vi-terms.test.ts. */
type EagerGlob = <T>(pattern: string, options: { eager: true }) => Record<string, T>;

/** Every string in a dictionary, with its dotted path. */
function flatten(o: unknown, path: string): [string, string][] {
  if (typeof o === 'string') return [[path, o]];
  if (Array.isArray(o)) return o.flatMap((v, i) => flatten(v, `${path}.${i}`));
  if (o !== null && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => flatten(v, `${path}.${k}`));
  return [];
}

const mods = (import.meta as ImportMeta & { glob: EagerGlob }).glob<{ messages: Messages<string> }>(
  '../../src/**/*.messages.ts',
  { eager: true },
);
const strings = Object.entries(mods).flatMap(([file, mod]) =>
  (['en', 'vi'] as const).flatMap((lang) => flatten(mod.messages[lang], `${file.replace(/^.*\//, '')} ${lang}`)),
);

describe('the self-hosted fonts draw every message', () => {
  it('opens the three families', () => {
    expect(FAMILY_NAMES.sort()).toEqual(['fraunces', 'inter', 'jetbrains-mono']);
  });

  it('finds a character the subsets lack (the check can fail)', () => {
    expect(missingGlyphs('limits →')).toEqual(['U+2192 → (fraunces, inter, jetbrains-mono)']);
    expect(missingGlyphs('Luật đóng băng · chưa kiểm toán … 0x7016')).toEqual([]);
  });

  it('has a glyph in every family for every character of every EN and VI string', () => {
    expect(strings.length).toBeGreaterThan(100);
    const offending = strings
      .map(([path, s]) => [path, missingGlyphs(s)] as const)
      .filter(([, missing]) => missing.length > 0)
      .map(([path, missing]) => `${path}: ${missing.join(', ')}`);
    // Draw an arrow or any other symbol the subsets lack as an icon (lucide-react), never as a character.
    expect(offending).toEqual([]);
  });
});
