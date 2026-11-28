import { parseHexColor, type Rgb } from '@/lib/css-color';

/** Blocks of 32 cases in the full proof (circuits FULL_BLOCKS): 2^21 × 32 = 2^26 cases. */
export const PROOF_BLOCKS = 2 ** 21;
/** Every (state, inputs) the proof checks: 2^26 = 67,108,864 (spec §18.2 rule 3: the page imports this number). */
export const TOTAL_CASES = PROOF_BLOCKS * 32;
/** One dot is 64 consecutive inputs of one starting state; the worker finishes them in 16 blocks. */
export const CASES_PER_DOT = 64;
const BLOCKS_PER_DOT = 16;
/** The largest map: 2^26 cases, 1024 × 1024 dots. The bit tricks of `lowX` and `lowY` hold up to there. */
const MAX_COMBO_BITS = 26;

/**
 * The map of 2^comboBits cases. Eight regions, 4 across and 2 down, one per starting state s (column s & 3,
 * row s >> 2); each region is w wide and 2w high and holds perRegion = 2^hBits dots in Morton (Z) order.
 * Case combo = s | v << 3 (circuits/src/verify.ts); dot p of state s holds v = 64p … 64p + 63.
 */
export interface ProofGrid {
  comboBits: number;
  hBits: number;
  half: number;
  w: number;
  h: number;
  size: number;
  perRegion: number;
}

export function comboBitsOf(blocks: number): number {
  const bits = Math.log2(blocks);
  if (!Number.isInteger(bits)) throw new Error(`blocks must be a power of two, got ${blocks}`);
  return bits + 5;
}

export function proofGrid(comboBits: number): ProofGrid {
  const hBits = comboBits - 9;
  if (!Number.isInteger(hBits) || hBits < 7 || hBits % 2 === 0 || comboBits > MAX_COMBO_BITS) {
    throw new Error(`no square map for 2^${comboBits} cases`);
  }
  const half = (hBits - 1) / 2;
  const w = 2 ** half;
  return { comboBits, hBits, half, w, h: 2 * w, size: 4 * w, perRegion: 2 ** hBits };
}

/** Dots finished in every region after `doneBlocks` blocks; 0 for a negative or missing count. */
export function pixelsDone(doneBlocks: number): number {
  return doneBlocks > 0 ? Math.floor(doneBlocks / BLOCKS_PER_DOT) : 0;
}

/** The even bits of a 16-bit number, packed: 0b0101 → 0b11. */
function evenBits(v: number): number {
  let n = v & 0x5555;
  n = (n | (n >>> 1)) & 0x3333;
  n = (n | (n >>> 2)) & 0x0f0f;
  return (n | (n >>> 4)) & 0x00ff;
}

/** x of dot p inside its region: the even bits of p. */
function lowX(g: ProofGrid, p: number): number {
  return evenBits(p & ((1 << (2 * g.half)) - 1));
}

/** y of dot p inside its region: the odd bits of p, and the top bit adds w (the lower square). */
function lowY(g: ProofGrid, p: number): number {
  return evenBits((p >>> 1) & ((1 << (2 * g.half)) - 1)) + ((p >>> (2 * g.half)) & 1) * g.w;
}

/** Canvas position of dot p of state s. */
export function pixelOf(g: ProofGrid, s: number, p: number): { x: number; y: number } {
  return { x: (s & 3) * g.w + lowX(g, p), y: (s >> 2) * g.h + lowY(g, p) };
}

export type ProofToken = 'surface-3' | 'alive' | 'grace' | 'recovery' | 'release' | 'line-strong';

/**
 * Colour of each starting state code (circuits/src/model.ts S): 0 active, 1 grace, 3 recovery, 5 and 7 released
 * (to the heirs, to the recovery wallet). 2, 4 and 6 are codes the vault never holds; the proof checks them too.
 */
export const STATE_TOKENS: readonly ProofToken[] = [
  'alive',
  'grace',
  'line-strong',
  'recovery',
  'line-strong',
  'release',
  'line-strong',
  'release',
];
/** A dot not checked yet. The same colour as the map's frame, so the prerendered page shows the empty map. */
export const BASE_TOKEN: ProofToken = 'surface-3';

/** The theme tokens of src/app/globals.css, for when a custom property cannot be read; paint.test.ts pins them. */
export const FALLBACK: Record<'light' | 'dark', Record<ProofToken, string>> = {
  dark: {
    'surface-3': '#20252f',
    alive: '#5cc8b0',
    grace: '#f0a23b',
    recovery: '#7fa8ff',
    release: '#b7a6ff',
    'line-strong': '#737985',
  },
  light: {
    'surface-3': '#e7dfd1',
    alive: '#106f5a',
    grace: '#945100',
    recovery: '#2e5bc7',
    release: '#5b44c9',
    'line-strong': '#80766a',
  },
};

/**
 * Four shades per state, by the top two bits of the dot index: four bands from the top of each region down, so the
 * map shows its order as it fills. Band 0 is the token itself.
 */
export const SHADES: readonly number[] = [1, 0.84, 0.7, 0.56];

export interface ProofPalette {
  theme: 'light' | 'dark';
  base: Rgb;
  /** states[s][band]: band 0 is the token itself, the others blend towards the base. */
  states: Rgb[][];
}

export function readPalette(read: (token: ProofToken) => string, theme: 'light' | 'dark'): ProofPalette {
  const color = (t: ProofToken): Rgb => parseHexColor(read(t)) ?? (parseHexColor(FALLBACK[theme][t]) as Rgb);
  const base = color(BASE_TOKEN);
  const mix = (c: Rgb, k: number): Rgb => [
    Math.round(base[0] + (c[0] - base[0]) * k),
    Math.round(base[1] + (c[1] - base[1]) * k),
    Math.round(base[2] + (c[2] - base[2]) * k),
  ];
  return { theme, base, states: STATE_TOKENS.map((t) => SHADES.map((k) => mix(color(t), k))) };
}

export function fillBase(data: Uint8ClampedArray, palette: ProofPalette): void {
  const [r, g, b] = palette.base;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
}

export interface DirtyRect {
  s: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Paints dots [from, to) of all eight states into an RGBA buffer of g.size² (`to` stops at the last dot) and
 * returns one box per state around what it painted, or [] when the range is empty. The eight boxes are the same
 * box inside each region, so the Morton position of a dot is worked out once for all eight states.
 */
export function paintRange(
  data: Uint8ClampedArray,
  g: ProofGrid,
  palette: ProofPalette,
  from: number,
  to: number,
): DirtyRect[] {
  const end = Math.min(to, g.perRegion);
  const start = Math.max(0, from);
  if (!(end > start)) return [];
  // Flat colour table, [state][band][rgb]: no array destructuring in the loop below.
  const lut = new Uint8Array(8 * 4 * 3);
  for (let s = 0; s < 8; s++) {
    for (let band = 0; band < 4; band++) lut.set(palette.states[s][band], (s * 4 + band) * 3);
  }
  const shift = g.hBits - 2;
  let minX = g.w;
  let minY = g.h;
  let maxX = -1;
  let maxY = -1;
  for (let p = start; p < end; p++) {
    const lx = lowX(g, p);
    const ly = lowY(g, p);
    if (lx < minX) minX = lx;
    if (ly < minY) minY = ly;
    if (lx > maxX) maxX = lx;
    if (ly > maxY) maxY = ly;
    const band = (p >>> shift) & 3;
    for (let s = 0; s < 8; s++) {
      const i = (((s >> 2) * g.h + ly) * g.size + (s & 3) * g.w + lx) * 4;
      const c = (s * 4 + band) * 3;
      data[i] = lut[c];
      data[i + 1] = lut[c + 1];
      data[i + 2] = lut[c + 2];
      data[i + 3] = 255;
    }
  }
  const rects: DirtyRect[] = [];
  for (let s = 0; s < 8; s++) {
    rects.push({ s, x: (s & 3) * g.w + minX, y: (s >> 2) * g.h + minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return rects;
}
