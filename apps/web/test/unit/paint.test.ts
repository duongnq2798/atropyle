// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseHexColor } from '../../src/lib/css-color';
import {
  CASES_PER_DOT,
  comboBitsOf,
  FALLBACK,
  fillBase,
  PROOF_BLOCKS,
  type ProofToken,
  paintRange,
  pixelOf,
  pixelsDone,
  proofGrid,
  readPalette,
  SHADES,
  TOTAL_CASES,
} from '../../src/proof/paint';

const CSS = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');

/** The `--atro-*` colours of the rule after a `/* tokens:<name> *\/` marker (the markers of contrast.test.ts). */
function tokens(marker: string): Record<string, string> {
  const at = CSS.indexOf(`/* tokens:${marker} */`);
  if (at < 0) throw new Error(`marker tokens:${marker} not found`);
  const body = CSS.slice(at, CSS.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/--atro-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]));
}

describe('proof map geometry', () => {
  it('gives a square map for every run size the site uses', () => {
    expect(TOTAL_CASES).toBe(67_108_864);
    expect(PROOF_BLOCKS * 32).toBe(TOTAL_CASES);
    expect(comboBitsOf(PROOF_BLOCKS)).toBe(26);
    expect(proofGrid(26)).toEqual({
      comboBits: 26,
      hBits: 17,
      half: 8,
      w: 256,
      h: 512,
      size: 1024,
      perRegion: 2 ** 17,
    });
    // Every dot is 64 cases: 8 regions × perRegion dots × 64 = all the cases.
    expect(8 * proofGrid(26).perRegion * CASES_PER_DOT).toBe(TOTAL_CASES);
    expect(proofGrid(comboBitsOf(2 ** 19)).size).toBe(512);
    expect(proofGrid(comboBitsOf(2 ** 17)).size).toBe(256);
    expect(proofGrid(16).size).toBe(32);
    for (const bits of [15, 17, 25, 27, 28, 26.5]) expect(() => proofGrid(bits), String(bits)).toThrow('no square map');
    expect(() => comboBitsOf(3)).toThrow('power of two');
    expect(() => comboBitsOf(0)).toThrow('power of two');
  });

  // 2^26 is the map the site ships, and the only size where x and y each take 8 of the 16 low bits of a dot.
  for (const bits of [16, 22, 26]) {
    it(`places every dot of a 2^${bits} map on its own pixel, inside its state's region`, () => {
      const g = proofGrid(bits);
      const seen = new Uint8Array(g.size * g.size);
      let outside = 0;
      for (let s = 0; s < 8; s++) {
        for (let p = 0; p < g.perRegion; p++) {
          const { x, y } = pixelOf(g, s, p);
          if ((Math.floor(x / g.w) | (Math.floor(y / g.h) << 2)) !== s) outside++;
          seen[y * g.size + x] += 1;
        }
      }
      expect(outside).toBe(0);
      expect(seen.every((n) => n === 1)).toBe(true);
    });
  }

  it('fills a region in Z order: even bits across, odd bits down, the top bit in the lower square', () => {
    const g = proofGrid(16); // w 8, h 16
    expect([0, 1, 2, 3, 4, 8].map((p) => pixelOf(g, 0, p))).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ]);
    expect(pixelOf(g, 0, 64)).toEqual({ x: 0, y: 8 });
    expect(pixelOf(g, 0, 127)).toEqual({ x: 7, y: 15 });
    // State 5: column 1, row 1.
    expect(pixelOf(g, 5, 0)).toEqual({ x: 8, y: 16 });
    // The 1024 × 1024 map: all 16 low bits of a dot reach x and y, and bit 16 picks the lower square.
    const g26 = proofGrid(26);
    expect(pixelOf(g26, 0, 0xffff)).toEqual({ x: 255, y: 255 });
    expect(pixelOf(g26, 0, 0x5555)).toEqual({ x: 255, y: 0 });
    expect(pixelOf(g26, 0, 0xaaaa)).toEqual({ x: 0, y: 255 });
    expect(pixelOf(g26, 0, 2 ** 16)).toEqual({ x: 0, y: 256 });
    expect(pixelOf(g26, 7, 2 ** 17 - 1)).toEqual({ x: 1023, y: 1023 });
  });

  it('counts a dot only when its 16 blocks are done', () => {
    expect(pixelsDone(15)).toBe(0);
    expect(pixelsDone(16)).toBe(1);
    expect(pixelsDone(1000)).toBe(62);
    expect(pixelsDone(PROOF_BLOCKS)).toBe(proofGrid(26).perRegion);
    for (const bad of [0, -16, Number.NaN]) expect(pixelsDone(bad)).toBe(0);
  });
});

describe('proof map paint', () => {
  const g = proofGrid(16);
  const night = readPalette(() => '', 'dark');
  const fresh = () => {
    const data = new Uint8ClampedArray(g.size * g.size * 4);
    fillBase(data, night);
    return data;
  };
  const rgbAt = (data: Uint8ClampedArray, x: number, y: number) => {
    const i = (y * g.size + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  it('paints in many small steps exactly like in one go', () => {
    const once = fresh();
    paintRange(once, g, night, 0, g.perRegion);
    const steps = fresh();
    for (let p = 0; p < g.perRegion; p += 5) paintRange(steps, g, night, p, Math.min(p + 5, g.perRegion));
    expect(steps).toEqual(once);
    // Every pixel is a checked dot now: none is left at the base.
    for (let i = 0; i < once.length; i += 4) expect([once[i], once[i + 1], once[i + 2]]).not.toEqual(night.base);
  });

  it('colours a dot by its starting state and leaves unchecked dots as the base', () => {
    const data = fresh();
    const rects = paintRange(data, g, night, 0, 1);
    expect(rgbAt(data, 0, 0)).toEqual([92, 200, 176, 255]); // alive, night
    const grace = pixelOf(g, 1, 0);
    expect(rgbAt(data, grace.x, grace.y)).toEqual([240, 162, 59, 255]); // grace, night
    expect(rgbAt(data, 1, 0)).toEqual([0x20, 0x25, 0x2f, 255]); // dot 1 of state 0: not checked yet
    expect(rects).toHaveLength(8);
    expect(rects[0]).toEqual({ s: 0, x: 0, y: 0, w: 1, h: 1 });
    expect(rects[5]).toEqual({ s: 5, x: 8, y: 16, w: 1, h: 1 });
    expect(paintRange(data, g, night, 3, 3)).toEqual([]);
  });

  it('returns, for each state, the box that holds what it painted', () => {
    const data = fresh();
    // Dots 4..11: the second 2 × 2 square, then the two below the first one.
    const rects = paintRange(data, g, night, 4, 12);
    expect(rects[0]).toEqual({ s: 0, x: 0, y: 0, w: 4, h: 4 });
    expect(rects[7]).toEqual({ s: 7, x: 24, y: 16, w: 4, h: 4 });
  });

  it('never paints past the last dot of a region', () => {
    const data = fresh();
    const rects = paintRange(data, g, night, g.perRegion - 1, g.perRegion + 50);
    expect(rects[0]).toEqual({ s: 0, x: 7, y: 15, w: 1, h: 1 });
    expect(paintRange(data, g, night, g.perRegion, g.perRegion + 50)).toEqual([]);
  });

  it('shades each region in four bands from the top down', () => {
    const data = fresh();
    paintRange(data, g, night, 0, g.perRegion);
    // Bands are w / 2 = 4 rows high in a 16-row region.
    for (let band = 0; band < 4; band++) expect(rgbAt(data, 0, band * 4).slice(0, 3)).toEqual(night.states[0][band]);
    expect(night.states[0][0]).toEqual([92, 200, 176]);
    expect(SHADES[0]).toBe(1);
  });

  it('reads the theme tokens and falls back to the values of globals.css', () => {
    expect(readPalette(() => '', 'light').base).toEqual([0xe7, 0xdf, 0xd1]);
    const custom = readPalette((t) => (t === 'alive' ? '#010203' : ''), 'dark');
    expect(custom.states[0][0]).toEqual([1, 2, 3]);
    expect(custom.base).toEqual([0x20, 0x25, 0x2f]);
    expect(parseHexColor(' #A0b1C2 ')).toEqual([160, 177, 194]);
    expect(parseHexColor('rgb(1, 2, 3)')).toBeNull();
    expect(parseHexColor('#abc')).toBeNull();
  });

  it('leaves 3:1 or more between ink and the bottom band of every region, where the finished map stamps its key', () => {
    /** WCAG 2.x contrast of two colours. */
    const contrast = (a: number[], b: number[]) => {
      const lum = (c: number[]) => {
        const [r, gr, b] = c.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      };
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    for (const theme of ['dark', 'light'] as const) {
      const css = tokens(theme);
      const palette = readPalette((t) => css[t] ?? '', theme);
      const ink = parseHexColor(css.ink ?? '') as number[];
      // The 3:1 of a graphic (WCAG 1.4.11): a glyph in ink over band 3 (SHADES[3]) of each of the eight codes.
      for (const [s, bands] of palette.states.entries()) {
        expect(contrast(ink, bands[3]), `${theme} code ${s}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps its fallback colours equal to the theme tokens of globals.css', () => {
    for (const theme of ['dark', 'light'] as const) {
      const css = tokens(theme);
      for (const t of Object.keys(FALLBACK[theme]) as ProofToken[]) {
        expect(FALLBACK[theme][t], `${theme} ${t}`).toBe(css[t]?.toLowerCase());
      }
    }
  });
});
