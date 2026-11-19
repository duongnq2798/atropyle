import { describe, expect, it } from 'vitest';
import { buildAll, deployedNetlists, listRefs, patchRefs } from '../src/index';

const CPU = '0x1111111111111111111111111111111111111111';

describe('listRefs', () => {
  it('finds the three REFs of the policy template in order', () => {
    const { policy } = buildAll();
    const refs = listRefs(policy.bytes);
    expect(refs.map((r) => r.offset)).toEqual(policy.refs.map((r) => r.offset));
    // Placeholder ids: KofN5 = 1, Ge4 = 2 (REF_TARGET_INDEX + 1), in whatever order the template uses them.
    expect(refs.map((r) => r.id)).toEqual(policy.refs.map((s) => (s.target === 'KofN5' ? 1n : 2n)));
    expect(policy.refs.filter((s) => s.target === 'KofN5')).toHaveLength(2);
    for (const r of refs) {
      expect(r.cpu).toBe('0x' + '00'.repeat(20));
      expect(r.nIn).toBe(8);
      expect(r.nOut).toBe(1);
    }
  });

  it('returns nothing for leaf circuits', () => {
    const { kofn, ge4 } = buildAll();
    expect(listRefs(kofn.bytes)).toEqual([]);
    expect(listRefs(ge4.bytes)).toEqual([]);
  });

  it('rejects truncated or unknown bytes', () => {
    expect(() => listRefs(Uint8Array.of(0, 0, 0))).toThrow('truncated');
    expect(() => listRefs(Uint8Array.of(9))).toThrow('bad opcode');
    expect(() => listRefs(Uint8Array.of(2, ...new Array(20).fill(0)))).toThrow('truncated');
  });
});

describe('deployedNetlists', () => {
  it('patches the real cpu and ids into the policy and leaves the leaves unchanged', () => {
    const b = buildAll();
    const d = deployedNetlists(CPU, [7n, 9n]);
    expect(d.kofn5).toEqual(b.kofn.bytes);
    expect(d.ge4).toEqual(b.ge4.bytes);
    expect(d.policy).toEqual(patchRefs(b.policy.bytes, b.policy.refs, CPU, [7n, 9n]));
    const refs = listRefs(d.policy);
    expect(refs.map((r) => r.cpu)).toEqual([CPU, CPU, CPU]);
    expect(refs.map((r) => r.id)).toEqual(b.policy.refs.map((s) => (s.target === 'KofN5' ? 7n : 9n)));
  });
});
