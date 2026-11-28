import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITALIC_SUBSETS, RANGES, SUBSETS } from '../../src/fonts/ranges';
import { outOf } from './paths';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** `U+0000-00FF,U+0131` (any case, any spacing, `?` wildcards) as sorted [start, end] pairs. */
function parseRanges(value: string): [number, number][] {
  return value
    .split(',')
    .map((part) => part.trim().replace(/^u\+/i, ''))
    .filter((p) => p !== '')
    .map((p): [number, number] => {
      if (p.includes('?'))
        return [Number.parseInt(p.replace(/\?/g, '0'), 16), Number.parseInt(p.replace(/\?/g, 'f'), 16)];
      const [a, b] = p.split('-');
      return [Number.parseInt(a, 16), Number.parseInt(b ?? a, 16)];
    })
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

interface Face {
  family: string;
  ranges: [number, number][] | null;
  sizeAdjust: boolean;
  style: string;
}

function faces(out: string): Face[] {
  const css = walk(join(out, '_next'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const body = m[1];
    // The last font-family wins, as in CSS: next/font writes `declarations` before its own properties.
    const families = [...body.matchAll(/font-family:\s*([^;]+)/g)].map((x) => x[1].replace(/['"]/g, '').trim());
    const range = /unicode-range:\s*([^;]+)/.exec(body);
    return {
      family: families[families.length - 1] ?? '',
      ranges: range ? parseRanges(range[1]) : null,
      sizeAdjust: /size-adjust:/.test(body),
      style: /font-style:\s*([^;]+)/.exec(body)?.[1].trim() ?? 'normal',
    };
  });
}

function builtCss(out: string): string {
  return walk(join(out, '_next'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
}

/** The families of a built font token, quotes stripped, in order: `--font-mono:'A','A Fallback',ui-monospace` gives [A, A Fallback, ui-monospace]. */
function tokenFamilies(css: string, token: string): string[] {
  const m = new RegExp(`${token}:\\s*([^;}]+)`).exec(css);
  if (!m) return [];
  return m[1].split(',').map((x) => x.replace(/['"]/g, '').trim());
}

/**
 * The stacks as the build ships them. Tailwind leaves out a theme variable that no rule reads: the voices read
 * --font-display and --font-mono, while the sans stack reaches the page as --default-font-family, the family that
 * Tailwind's base gives <html> (font-sans utilities write it out). Tailwind scans the app, not these tests
 * (globals.css), so a token named here is never kept for this file's sake.
 */
const STACKS = [
  ['--font-display', 'Atropyle Fraunces'],
  ['--default-font-family', 'Atropyle Inter'],
  ['--font-mono', 'Atropyle Mono'],
] as const;

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} fonts`, () => {
    const out = outOf(target);

    for (const family of ['Atropyle Fraunces', 'Atropyle Inter', 'Atropyle Mono']) {
      it(`${family} has one face per subset, each with its own unicode range`, () => {
        const ours = faces(out).filter((f) => f.family === family && f.style !== 'italic');
        expect(ours).toHaveLength(3);
        const got = ours.map((f) => JSON.stringify(f.ranges)).sort();
        const want = SUBSETS.map((s) => JSON.stringify(parseRanges(RANGES[s]))).sort();
        expect(got).toEqual(want);
      });

      it(`${family} has a metric-adjusted fallback face, so the swap does not shift layout`, () => {
        const fallback = faces(out).filter((f) => f.family === `${family} Fallback`);
        expect(fallback).toHaveLength(1);
        expect(fallback[0].sizeAdjust).toBe(true);
      });
    }

    for (const [token, family] of STACKS) {
      it(`${token} names the faces that exist: ${family}, then ${family} Fallback`, () => {
        const stack = tokenFamilies(builtCss(out), token);
        expect(stack[0]).toBe(family);
        expect(faces(out).filter((f) => f.family === stack[0] && f.style !== 'italic')).toHaveLength(3);
        expect(stack[1]).toBe(`${family} Fallback`);
        const fallback = faces(out).filter((f) => f.family === stack[1]);
        expect(fallback).toHaveLength(1);
        expect(fallback[0].sizeAdjust).toBe(true);
      });
    }

    it('preloads exactly the Latin files of Fraunces and Inter on the home page', () => {
      const html = readFileSync(join(out, 'index.html'), 'utf8');
      const preloads = [...html.matchAll(/<link[^>]+rel="preload"[^>]+as="font"[^>]*>/g)].map((m) => m[0]);
      expect(preloads).toHaveLength(2);
      for (const p of preloads) expect(p).toMatch(/\.woff2"/);
      const hrefs = preloads.map((p) => /href="([^"]+)"/.exec(p)?.[1] ?? '');
      for (const name of ['fraunces_latin_standard_normal', 'inter_latin_wght_normal']) {
        expect(
          hrefs.filter((h) => h.includes(name)),
          name,
        ).toHaveLength(1);
      }
    });

    it('draws the Ledger voice in the self-hosted mono family, and the checksum capitals of an address at 650', () => {
      const css = builtCss(out);
      expect(css).toMatch(/\.voice-ledger\{[^}]*font-family:var\(--font-mono\)/);
      expect(css).toMatch(/\.voice-ledger\{[^}]*font-variant-ligatures:none/);
      // The rule of the class Address and the account button give the capitals, not any rule at 650.
      expect(css).toMatch(/\.font-\\\[650\\\]\{[^}]*font-weight:650/);
      expect(css).not.toMatch(/"SOFT"|"WONK"/);
    });

    it('Atropyle Fraunces has the two italic faces of the Letter voice, Latin and Vietnamese, never preloaded', () => {
      const italic = faces(out).filter((f) => f.family === 'Atropyle Fraunces' && f.style === 'italic');
      expect(italic.map((f) => JSON.stringify(f.ranges)).sort()).toEqual(
        ITALIC_SUBSETS.map((s) => JSON.stringify(parseRanges(RANGES[s]))).sort(),
      );
      const html = readFileSync(join(out, 'index.html'), 'utf8');
      expect(html).not.toMatch(/standard_italic/);
    });

    it('draws the Letter voice in italic Fraunces, and no first paint of /, /create/ or /proof/ uses it', () => {
      const css = builtCss(out);
      expect(css).toMatch(/\.voice-letter\{[^}]*font-style:italic/);
      // /create/ and /proof/ live on other branches until the web v2 branches merge: each page is read where it is built.
      const pages = ['index.html', 'create/index.html', 'proof/index.html'].filter((p) => existsSync(join(out, p)));
      expect(pages).toContain('index.html');
      for (const page of pages) {
        expect(readFileSync(join(out, page), 'utf8'), page).not.toMatch(/voice-letter/);
      }
    });

    it('never reaches a font CDN', () => {
      const all = walk(out)
        .filter((f) => /\.(html|css|js)$/.test(f))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
      expect(all).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|fonts\.bunny/);
    });
  });
}
