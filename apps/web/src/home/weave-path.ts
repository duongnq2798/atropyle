import { HERO_CASES, LETTER } from './hero-cases';
import { NODES, THREAD, WIRE_V, WIRES } from './netlist-geometry';

/**
 * From (x1, y1) to (x2, y2) as a schematic draws a wire: leave level, turn once halfway, arrive level. A level wire
 * is a straight line. The path is already at (x1, y1).
 */
export function segment(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `H${x2}`;
  const mx = Math.round((x1 + x2) / 2);
  return `C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}

export interface WirePath {
  /** The NAND layer the wires enter, 1 … DEPTHS. */
  depth: number;
  /** Their value signature: bit j set when they carry 1 in question j of HERO_CASES (WIRE_V). */
  v: number;
  d: string;
}

/**
 * The wires entering each NAND layer, one path per value signature, in op order inside each path; sorted by depth,
 * then signature. Each wire is drawn once, so splitting adds no `d` text, only one element per signature
 * (spec §18.4.3 Task 5′: a chip lights wires by their `data-v`). Both inputs of a NAND tied to one signal are two
 * entries of WIRES on the same line, so they carry the same signature too: drawn once, as a second copy only doubled
 * the anti-aliased edge and the HTML, twice (the DOM and Next's payload; 7C-F1).
 */
export function wirePaths(): WirePath[] {
  const by = new Map<number, string>();
  const drawn = new Set<string>();
  for (let i = 0, w = 0; i < WIRES.length; i += 5, w++) {
    const [x1, y1, x2, y2, depth] = [WIRES[i], WIRES[i + 1], WIRES[i + 2], WIRES[i + 3], WIRES[i + 4]];
    const key = depth * 8 + WIRE_V[w];
    const part = `M${x1} ${y1}${segment(x1, y1, x2, y2)}`;
    if (drawn.has(`${key}${part}`)) continue;
    drawn.add(`${key}${part}`);
    by.set(key, `${by.get(key) ?? ''}${part}`);
  }
  return [...by.entries()].sort(([a], [b]) => a - b).map(([key, d]) => ({ depth: key >> 3, v: key & 7, d }));
}

/** The letters of the questions a signature lights, as `data-v` writes them ('a s l'); '' for none. */
export function lettersOf(v: number): string {
  return HERO_CASES.filter((_, j) => (v >> j) & 1)
    .map((c) => LETTER[c])
    .join(' ');
}

/** Every signal as a dot: a zero-length segment drawn with a round cap. */
export function dotsPath(): string {
  let d = '';
  for (let i = 0; i < NODES.length; i += 2) d += `M${NODES[i]} ${NODES[i + 1]}h0`;
  return d;
}

/** The thread: the same wire curves as the circuit, through every point of THREAD, from edge to edge. */
export function threadPath(): string {
  let d = `M${THREAD[0]} ${THREAD[1]}`;
  for (let i = 2; i < THREAD.length; i += 2) d += segment(THREAD[i - 2], THREAD[i - 1], THREAD[i], THREAD[i + 1]);
  return d;
}
