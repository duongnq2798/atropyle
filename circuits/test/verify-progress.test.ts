import { describe, expect, it } from 'vitest';
import { buildAll } from '../src/policy';
import { verifyPolicy } from '../src/verify';

const program = buildAll().program;

describe('verifyPolicy progress', () => {
  it('reports every progressEvery blocks and always at the last block', () => {
    const calls: [number, number][] = [];
    verifyPolicy(program, { blocks: 10, progressEvery: 4, onProgress: (d, t) => calls.push([d, t]) });
    expect(calls).toEqual([
      [4, 10],
      [8, 10],
      [10, 10],
    ]);
  });

  it('reports the last block once when the cadence divides the run', () => {
    const calls: number[] = [];
    verifyPolicy(program, { blocks: 8, progressEvery: 4, onProgress: (d) => calls.push(d) });
    expect(calls).toEqual([4, 8]);
  });

  it('keeps the 65 536-block default and still ends at done === total', () => {
    const calls: number[] = [];
    verifyPolicy(program, { blocks: 70_000, onProgress: (d) => calls.push(d) });
    expect(calls).toEqual([65_536, 70_000]);
  });

  it('refuses a cadence that is not a positive whole number', () => {
    for (const progressEvery of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => verifyPolicy(program, { blocks: 1, progressEvery })).toThrow('progressEvery');
    }
  });

  it('reports a run shorter than the cadence once, at its last block, and an empty run never', () => {
    const calls: [number, number][] = [];
    verifyPolicy(program, { blocks: 3, progressEvery: 4, onProgress: (d, t) => calls.push([d, t]) });
    expect(calls).toEqual([[3, 3]]);
    const byDefault: number[] = [];
    verifyPolicy(program, { blocks: 10, onProgress: (d) => byDefault.push(d) });
    expect(byDefault).toEqual([10]);
    const empty: number[] = [];
    verifyPolicy(program, { blocks: 0, progressEvery: 4, onProgress: (d) => empty.push(d) });
    expect(empty).toEqual([]);
  });
});
