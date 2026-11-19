import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportAll } from '../src/export';
import { refStepCode } from '../src/model';

const FILES = ['kofn5.json', 'ge4.json', 'policy.template.json', 'vectors.json'];
const committedDir = fileURLToPath(new URL('../../contracts/circuits/', import.meta.url));

describe('export', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atropyle-'));
  const r = exportAll(dir);
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

  it('writes the three circuits with gate counts', () => {
    expect(read('kofn5.json')).toMatchObject({
      name: 'KofN5', nIn: 8, nOut: 1, nand: 41, latch: 0, gateCount: 41, refOffsets: [], refTargets: [],
    });
    expect(read('ge4.json')).toMatchObject({ name: 'Ge4', nIn: 8, nOut: 1, nand: 25, latch: 0, gateCount: 25 });
    const p = read('policy.template.json');
    expect(p).toMatchObject({ name: 'AtropylePolicy', nIn: 23, nOut: 3, latch: 3, refTargets: [0, 0, 1] });
    expect(p.gateCount).toBe(r.policyGateCount);
    expect(p.netlist).toMatch(/^0x[0-9a-f]+$/);
  });

  it('writes vectors that match the reference model', () => {
    const v = read('vectors.json');
    expect(v.states).toHaveLength(512);
    v.states.forEach((s: number, i: number) => {
      expect(s).toBe(i % 8);
      expect(v.next[i] | (v.out[i] << 3)).toBe(refStepCode(s, v.inputs[i]));
    });
  });

  it('committed contracts/circuits files are up to date', () => {
    for (const f of FILES) {
      expect(readFileSync(join(committedDir, f), 'utf8'), f).toBe(readFileSync(join(dir, f), 'utf8'));
    }
  });
});
