import { describe, expect, it } from 'vitest';
import { DEPTHS, NODES, THREAD, VIEW, WIRE_V, WIRES } from '../../src/home/netlist-geometry';
import { dotsPath, lettersOf, segment, threadPath, wirePaths } from '../../src/home/weave-path';

describe('weave paths', () => {
  it('splits every NAND layer by value signature, draws each wire once, and one dot per signal', () => {
    const paths = wirePaths();
    expect(new Set(paths.map((p) => p.depth))).toEqual(new Set(Array.from({ length: DEPTHS }, (_, i) => i + 1)));
    const key = (p: { depth: number; v: number }) => p.depth * 8 + p.v;
    for (let i = 1; i < paths.length; i++) expect(key(paths[i])).toBeGreaterThan(key(paths[i - 1]));
    expect(paths).toHaveLength(new Set(WIRE_V.map((v, w) => WIRES[w * 5 + 4] * 8 + v)).size);
    for (const p of paths) expect(p.d).toMatch(/^M\d/);
    expect(
      paths
        .map((p) => p.d)
        .join('')
        .match(/M/g),
    ).toHaveLength(WIRES.length / 5);
    // Splitting adds no `d` text (spec §18.4.3 Task 5′): the same wire parts, regrouped.
    let parts = 0;
    for (let i = 0; i < WIRES.length; i += 5) {
      parts += `M${WIRES[i]} ${WIRES[i + 1]}${segment(WIRES[i], WIRES[i + 1], WIRES[i + 2], WIRES[i + 3])}`.length;
    }
    expect(paths.reduce((n, p) => n + p.d.length, 0)).toBe(parts);
    expect(dotsPath().match(/M/g)).toHaveLength(NODES.length / 2);
    expect(dotsPath().startsWith(`M${NODES[0]} ${NODES[1]}h0M${NODES[2]} ${NODES[3]}h0`)).toBe(true);
  });

  it('names the questions a signature lights, in HERO_CASES order', () => {
    expect([0, 1, 2, 4, 5, 7].map(lettersOf)).toEqual(['', 'a', 's', 'l', 'a l', 'a s l']);
  });

  it('draws a wire as a schematic does: level out, one turn halfway, level in', () => {
    expect(segment(10, 20, 50, 80)).toBe('C30 20 30 80 50 80');
    expect(segment(10, 20, 50, 20)).toBe('H50');
  });

  it('draws the thread through every point of THREAD, from the left edge to the right edge', () => {
    const d = threadPath();
    expect(d.startsWith(`M0 ${THREAD[1]}`)).toBe(true);
    expect(d.match(/[CH]/g)).toHaveLength(THREAD.length / 2 - 1);
    expect(d.endsWith(`H${VIEW.w}`)).toBe(true);
    for (let i = 2; i < THREAD.length; i += 2) {
      const level = THREAD[i + 1] === THREAD[i - 1];
      expect(d).toContain(level ? `H${THREAD[i]}` : ` ${THREAD[i]} ${THREAD[i + 1]}`);
    }
  });
});
