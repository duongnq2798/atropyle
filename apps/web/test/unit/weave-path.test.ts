import { describe, expect, it } from 'vitest';
import { DEPTHS, NODES, THREAD, VIEW, WIRES } from '../../src/home/netlist-geometry';
import { dotsPath, segment, threadPath, wirePaths } from '../../src/home/weave-path';

describe('weave paths', () => {
  it('draws one path per NAND layer holding every wire, and one dot per signal', () => {
    const paths = wirePaths();
    expect(paths).toHaveLength(DEPTHS);
    for (const d of paths) expect(d).toMatch(/^M\d/);
    expect(paths.join('').match(/M/g)).toHaveLength(WIRES.length / 5);
    expect(dotsPath().match(/M/g)).toHaveLength(NODES.length / 2);
    expect(dotsPath().startsWith(`M${NODES[0]} ${NODES[1]}h0M${NODES[2]} ${NODES[3]}h0`)).toBe(true);
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
