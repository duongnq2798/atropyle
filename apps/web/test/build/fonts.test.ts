import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RANGES, SUBSETS } from '../../src/fonts/ranges';
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
    };
  });
}

function builtCss(out: string): string {
  return walk(join(out, '_next'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
}

/** The families of a built font token, quotes stripped, in order: `--font-sans:'A','A Fallback',ui-sans-serif` gives [A, A Fallback, ui-sans-serif]. */
function tokenFamilies(css: string, token: string): string[] {
  const m = new RegExp(`${token}:\\s*([^;}]+)`).exec(css);
  if (!m) return [];
  return m[1].split(',').map((x) => x.replace(/['"]/g, '').trim());
}

const STACKS = [
  ['--font-display', 'Atropyle Fraunces'],
  ['--font-sans', 'Atropyle Inter'],
  ['--font-mono', 'Atropyle Mono'],
] as const;

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} fonts`, () => {
    const out = outOf(target);

    for (const family of ['Atropyle Fraunces', 'Atropyle Inter', 'Atropyle Mono']) {
      it(`${family} has one face per subset, each with its own unicode range`, () => {
        const ours = faces(out).filter((f) => f.family === family);
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
        expect(faces(out).filter((f) => f.family === stack[0])).toHaveLength(3);
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
      expect(css).toMatch(/font-weight:650/);
      expect(css).not.toMatch(/"SOFT"|"WONK"/);
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
