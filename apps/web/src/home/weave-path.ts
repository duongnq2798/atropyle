import { DEPTHS, NODES, THREAD, WIRES } from './netlist-geometry';

/**
 * From (x1, y1) to (x2, y2) as a schematic draws a wire: leave level, turn once halfway, arrive level. A level wire
 * is a straight line. The path is already at (x1, y1).
 */
export function segment(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `H${x2}`;
  const mx = Math.round((x1 + x2) / 2);
  return `C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}

/** One path per NAND layer: the wires entering layer d (1 … DEPTHS), in op order. */
export function wirePaths(): string[] {
  const parts: string[] = Array.from({ length: DEPTHS }, () => '');
  for (let i = 0; i < WIRES.length; i += 5) {
    const [x1, y1, x2, y2, d] = [WIRES[i], WIRES[i + 1], WIRES[i + 2], WIRES[i + 3], WIRES[i + 4]];
    parts[d - 1] += `M${x1} ${y1}${segment(x1, y1, x2, y2)}`;
  }
  return parts;
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
