import { buildAll, deployedNetlists, type PolicyInputs } from '@atropyle/circuits';
import { hexToBytes, toHex } from 'viem';
import { describe, expect, it } from 'vitest';
import { fetchPolicyProgram, modelEngine, programEngine } from '../../src/index';

const CPU = '0x2222222222222222222222222222222222222222';

function randomInputs(r: () => number): PolicyInputs {
  return {
    idle: Math.floor(r() * 16),
    threshold: Math.floor(r() * 16),
    inhVotes: Math.floor(r() * 32),
    recVotes: Math.floor(r() * 32),
    k: Math.floor(r() * 8),
    alive: r() < 0.5,
    windowDone: r() < 0.5,
  };
}

function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function source(map: Map<bigint, Uint8Array>) {
  return {
    netlist: async (id: bigint) => map.get(id) ?? new Uint8Array(),
    info: async () => ({ nIn: 23, nOut: 3 }),
  };
}

describe('policy engines', () => {
  it('the compiled netlist and the model agree on random inputs', () => {
    const net = programEngine(buildAll().program);
    const model = modelEngine();
    const r = lcg(42);
    for (let i = 0; i < 5000; i++) {
      const s = [0, 1, 3, 5, 7][Math.floor(r() * 5)];
      const inp = randomInputs(r);
      expect(net.step(s, inp)).toEqual(model.step(s, inp));
    }
    expect(net.kind).toBe('netlist');
  });

  it('fetches the policy and its REF targets from one CPU', async () => {
    const d = deployedNetlists(CPU, [7n, 9n]);
    const map = new Map([
      [11n, d.policy],
      [7n, d.kofn5],
      [9n, d.ge4],
    ]);
    const fetched = await fetchPolicyProgram(CPU, 11n, source(map));
    expect(fetched).not.toBeNull();
    expect([...(fetched?.netlists.keys() ?? [])].sort((a, b) => Number(a - b))).toEqual([7n, 9n, 11n]);
    const net = programEngine(fetched!.program);
    const r = lcg(7);
    for (let i = 0; i < 500; i++) {
      const inp = randomInputs(r);
      expect(net.step(1, inp)).toEqual(modelEngine().step(1, inp));
    }
  });

  it('returns null for an empty netlist (devnet mock CPU)', async () => {
    expect(await fetchPolicyProgram(CPU, 1n, source(new Map()))).toBeNull();
  });

  it('rejects REFs into another CPU and malformed bytes', async () => {
    const other = deployedNetlists('0x3333333333333333333333333333333333333333', [7n, 9n]);
    await expect(fetchPolicyProgram(CPU, 11n, source(new Map([[11n, other.policy]])))).rejects.toMatchObject({
      code: 'POLICY_MISMATCH',
    });
    await expect(fetchPolicyProgram(CPU, 11n, source(new Map([[11n, Uint8Array.of(9, 9)]])))).rejects.toMatchObject({
      code: 'POLICY_MISMATCH',
    });
  });

  it('lets RPC errors through: a flaky connection is not a policy mismatch', async () => {
    const down = new Error('rpc down');
    const info = async () => ({ nIn: 23, nOut: 3 });
    await expect(
      fetchPolicyProgram(CPU, 11n, {
        netlist: async () => {
          throw down;
        },
        info,
      }),
    ).rejects.toBe(down);
    const policy = deployedNetlists(CPU, [7n, 9n]).policy;
    const netlist = async (id: bigint) => {
      if (id === 11n) return policy;
      throw down;
    };
    await expect(fetchPolicyProgram(CPU, 11n, { netlist, info })).rejects.toBe(down);
  });

  it('rejects a REF target that does not exist and a policy with too many sub-circuits', async () => {
    const policy = deployedNetlists(CPU, [7n, 9n]).policy;
    await expect(fetchPolicyProgram(CPU, 11n, source(new Map([[11n, policy]])))).rejects.toMatchObject({
      code: 'POLICY_MISMATCH',
    });
    const refs = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n].flatMap((id) => [
      2,
      ...hexToBytes(CPU),
      ...hexToBytes(toHex(id, { size: 8 })),
      0,
      0,
    ]);
    await expect(fetchPolicyProgram(CPU, 99n, source(new Map([[99n, Uint8Array.from(refs)]])))).rejects.toMatchObject({
      code: 'POLICY_MISMATCH',
      message: expect.stringContaining('too many'),
    });
  });

  it('rejects programs of the wrong shape', () => {
    expect(() => programEngine({ ...buildAll().program, nIn: 8 })).toThrow(
      expect.objectContaining({ code: 'POLICY_MISMATCH' }),
    );
  });
});
