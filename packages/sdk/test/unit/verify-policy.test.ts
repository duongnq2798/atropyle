import { buildAll, deployedNetlists, stepBytes } from '@atropyle/circuits';
import { bytesToHex, getAddress, type Hex, hexToBytes, keccak256, type PublicClient } from 'viem';
import { describe, expect, it } from 'vitest';
import { type Deployment, getDeployment } from '../../src/deployments/index';
import {
  evaluatePolicyBundle,
  type P9Answer,
  type P9Reads,
  type PolicyBundle,
  p9Vectors,
  readIntegrity,
  vectorBytes,
} from '../../src/verify/index';

const CPU = getAddress('0x1111111111111111111111111111111111111111');
const OTHER = getAddress('0x2222222222222222222222222222222222222222');
const FACTORY = getAddress('0x3333333333333333333333333333333333333333');
const IDS = [5n, 6n] as const;
const POLICY_ID = 7n;
const src = buildAll();
const nl = deployedNetlists(CPU, IDS);
const sub = (c: { nand: number; latch: number }) => c.nand + c.latch;

function bundle(over: Partial<PolicyBundle> = {}): PolicyBundle {
  return {
    chainId: 196,
    blockNumber: 1n,
    rpcs: 2,
    factory: FACTORY,
    cpu: CPU,
    policyId: POLICY_ID,
    expected: {
      cpu: CPU,
      policyId: POLICY_ID,
      kofn5: IDS[0],
      ge4: IDS[1],
      keccak: { policy: keccak256(nl.policy), kofn5: keccak256(nl.kofn5), ge4: keccak256(nl.ge4) },
    },
    netlists: [
      { id: POLICY_ID, bytes: bytesToHex(nl.policy), nIn: 23, nOut: 3, nState: 3, gateCount: src.program.gateCount },
      {
        id: IDS[0],
        bytes: bytesToHex(nl.kofn5),
        nIn: src.kofn.nIn,
        nOut: src.kofn.nOut,
        nState: 0,
        gateCount: sub(src.kofn),
      },
      {
        id: IDS[1],
        bytes: bytesToHex(nl.ge4),
        nIn: src.ge4.nIn,
        nOut: src.ge4.nOut,
        nState: 0,
        gateCount: sub(src.ge4),
      },
    ],
    cpuCheck: {
      ok: true,
      isTapeoutCpu: true,
      nameMatches: true,
      symbolMatches: true,
      beacon: OTHER,
      beaconMatches: true,
      beaconFrozen: true,
      transistorsPaired: true,
      code: {
        proxyCodehash: HASH_A,
        implementation: OTHER,
        implementationCodehash: HASH_B,
        expected: { proxyCodehash: HASH_A, implementation: OTHER, implementationCodehash: HASH_B },
        matches: true,
      },
    },
    ...over,
  };
}

const HASH_A = keccak256('0x6001');
const HASH_B = keccak256('0x6002');

/** What the simulator of this repository's policy answers for a vector, packed as step() returns it. */
function simulated(state: Hex, inputs: Hex): { next: Hex; out: Hex } {
  const r = stepBytes(src.program, hexToBytes(state), hexToBytes(inputs));
  return { next: bytesToHex(r.next), out: bytesToHex(r.out) };
}

/** P9 reads where every operator answers like the simulator, except where `lie` says otherwise. */
function p9Reads(operators = 2, lie: (op: number, i: number, a: P9Answer) => P9Answer = (_o, _i, a) => a): P9Reads {
  const vectors = p9Vectors(7n);
  return {
    seed: 7n,
    vectors,
    ms: 12,
    operators: Array.from({ length: operators }, (_, k) => ({
      operator: k + 1,
      blockNumber: 1n,
      multicall: true,
      calls: 4,
      answers: vectors.map((v, i) => {
        const b = vectorBytes(v);
        return lie(k + 1, i, simulated(b.state, b.inputs));
      }),
    })),
  };
}

describe('evaluatePolicyBundle', () => {
  it('accepts the netlists built from this repository', async () => {
    const r = await evaluatePolicyBundle(bundle(), { blocks: 4096 });
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.combos).toBe(4096 * 32);
    expect(Object.values(r.properties).every((p) => p.ok && p.violations === 0)).toBe(true);
    expect(r.netlists.map((n) => [n.role, n.matchesSource, n.matchesDeployment])).toEqual([
      ['policy', true, true],
      ['kofn5', true, true],
      ['ge4', true, true],
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('flags a policy netlist that differs from the source', async () => {
    const b = bundle();
    const bytes = nl.policy.slice();
    bytes[bytes.length - 2] ^= 1;
    b.netlists[0] = { ...b.netlists[0], bytes: bytesToHex(bytes) };
    const r = await evaluatePolicyBundle(b, { blocks: 64 });
    expect(r.ok).toBe(false);
    expect(r.netlists[0].matchesSource).toBe(false);
  });

  it('flags REFs that point to another CPU', async () => {
    const b = bundle();
    b.netlists[0] = { ...b.netlists[0], bytes: bytesToHex(deployedNetlists(OTHER, IDS).policy) };
    const r = await evaluatePolicyBundle(b, { blocks: 64 });
    expect(r.ok).toBe(false);
    expect(r.issues.join('\n')).toContain('another CPU');
  });

  it('flags a wrong shape and warns about a single operator', async () => {
    const b = bundle({ rpcs: 1 });
    b.netlists[0] = { ...b.netlists[0], nIn: 22 };
    const r = await evaluatePolicyBundle(b, { blocks: 64 });
    expect(r.ok).toBe(false);
    expect(r.issues.join('\n')).toContain('23/3/3');
    expect(r.warnings.map((w) => w.code)).toEqual(['SINGLE_RPC']);
  });

  it('throws POLICY_UNAVAILABLE when the CPU has no netlist', async () => {
    const b = bundle();
    b.netlists[0] = { ...b.netlists[0], bytes: '0x' };
    await expect(evaluatePolicyBundle(b)).rejects.toMatchObject({ code: 'POLICY_UNAVAILABLE' });
  });

  it('flags a policy whose two REF roles use the same circuit id', async () => {
    const same = deployedNetlists(CPU, [IDS[0], IDS[0]]);
    const b = bundle();
    b.expected = { ...b.expected, ge4: null, keccak: null };
    b.netlists[0] = { ...b.netlists[0], bytes: bytesToHex(same.policy) };
    const r = await evaluatePolicyBundle(b, { blocks: 64 });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('KofN5 and Ge4 use the same circuit id');
  });

  it('does not accept a mainnet bundle without a CPU check, but a devnet one is unchanged', async () => {
    const m = await evaluatePolicyBundle(bundle({ cpuCheck: null }), { blocks: 64 });
    expect(m.ok).toBe(false);
    expect(m.issues.join(' ')).toContain('no TapeOut info');
    const d = await evaluatePolicyBundle(bundle({ chainId: 31337, cpuCheck: null }), { blocks: 64 });
    expect(d.ok).toBe(true);
  });

  it('does not accept a mainnet deployment that records no circuits, but a devnet one is unchanged', async () => {
    const none = { kofn5: null, ge4: null, keccak: null };
    const main = bundle();
    main.expected = { ...main.expected, ...none };
    const m = await evaluatePolicyBundle(main, { blocks: 64 });
    expect(m.ok).toBe(false);
    expect(m.issues.join('\n')).toContain('records no circuit ids');
    expect(m.netlists.every((n) => n.matchesDeployment === null)).toBe(true);

    const dev = bundle({ chainId: 31337 });
    dev.expected = { ...dev.expected, ...none };
    const d = await evaluatePolicyBundle(dev, { blocks: 64 });
    expect(d.issues).toEqual([]);
    expect(d.ok).toBe(true);
  });

  it('reports progress at the cadence it is given', async () => {
    const calls: [number, number][] = [];
    await evaluatePolicyBundle(bundle(), { blocks: 10, progressEvery: 4, onProgress: (d, t) => calls.push([d, t]) });
    expect(calls).toEqual([
      [4, 10],
      [8, 10],
      [10, 10],
    ]);
  });

  it('refuses a bad progress cadence instead of reporting a failed proof', async () => {
    for (const progressEvery of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(evaluatePolicyBundle(bundle(), { blocks: 1, progressEvery })).rejects.toMatchObject({
        code: 'INVALID_OPTIONS',
      });
    }
  });
});

describe('evaluatePolicyBundle: P9 and the code pins', () => {
  it('passes P9 when every operator answers like the simulator', async () => {
    const r = await evaluatePolicyBundle(bundle({ p9: p9Reads() }), { blocks: 64 });
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.p9).toEqual({
      ok: true,
      seed: 7n,
      vectors: 64,
      operators: [
        { operator: 1, blockNumber: 1n, multicall: true, calls: 4, matched: 64 },
        { operator: 2, blockNumber: 1n, multicall: true, calls: 4, matched: 64 },
      ],
      mismatches: [],
      ms: 12,
    });
  });

  it('reports every mismatch with its vector and operator, and fails', async () => {
    const reads = p9Reads(2, (op, i, a) => {
      if (op === 2 && i === 5) return { ...(a as { next: Hex; out: Hex }), out: '0x07' };
      if (op === 1 && i === 9) return { error: 'reverted' };
      return a;
    });
    const r = await evaluatePolicyBundle(bundle({ p9: reads }), { blocks: 64 });
    expect(r.ok).toBe(false);
    expect(r.p9?.ok).toBe(false);
    const v5 = reads.vectors[5];
    const v9 = reads.vectors[9];
    const b5 = vectorBytes(v5);
    const b9 = vectorBytes(v9);
    expect(r.p9?.mismatches).toEqual([
      {
        operator: 1,
        index: 9,
        state: v9.state,
        inputs: v9.inputs,
        expectNext: simulated(b9.state, b9.inputs).next,
        expectOut: simulated(b9.state, b9.inputs).out,
        next: null,
        out: null,
        error: 'reverted',
      },
      {
        operator: 2,
        index: 5,
        state: v5.state,
        inputs: v5.inputs,
        expectNext: simulated(b5.state, b5.inputs).next,
        expectOut: simulated(b5.state, b5.inputs).out,
        next: simulated(b5.state, b5.inputs).next,
        out: '0x07',
        error: null,
      },
    ]);
    expect(r.p9?.operators.map((o) => o.matched)).toEqual([63, 63]);
    expect(r.issues).toEqual([
      'P9: 1 of 64 vectors differ between the simulator and step() on RPC operator #1',
      'P9: 1 of 64 vectors differ between the simulator and step() on RPC operator #2',
    ]);
  });

  it('fails P9 on missing answers or a short run, and when no operator was asked', async () => {
    const short = p9Reads();
    short.operators[0].answers = short.operators[0].answers.slice(0, 60);
    const r = await evaluatePolicyBundle(bundle({ p9: short }), { blocks: 64 });
    expect(r.ok).toBe(false);
    expect(r.p9?.mismatches.map((m) => [m.index, m.error])).toEqual([
      [60, 'missing'],
      [61, 'missing'],
      [62, 'missing'],
      [63, 'missing'],
    ]);
    const none = await evaluatePolicyBundle(bundle({ p9: { ...p9Reads(), operators: [] } }), { blocks: 64 });
    expect(none.ok).toBe(false);
    expect(none.issues).toContain('P9 asked no RPC operator');
  });

  it('leaves p9 null and the result unchanged without P9 reads (the web worker path)', async () => {
    const absent = bundle();
    delete absent.p9;
    for (const b of [absent, bundle({ p9: null })]) {
      const r = await evaluatePolicyBundle(b, { blocks: 64 });
      expect(r.p9).toBeNull();
      expect(r.ok).toBe(true);
    }
  });

  it('fails a mainnet CPU whose code differs from the pins, or that has no pin', async () => {
    const base = bundle();
    const cc = base.cpuCheck as NonNullable<PolicyBundle['cpuCheck']>;
    const wrong = bundle({
      cpuCheck: { ...cc, ok: false, code: { ...cc.code, proxyCodehash: HASH_B, matches: false } },
    });
    const w = await evaluatePolicyBundle(wrong, { blocks: 64 });
    expect(w.ok).toBe(false);
    expect(w.issues.join('\n')).toContain('differs from the pinned hashes');
    const unpinned = { ...cc, code: { ...cc.code, expected: null, matches: null } };
    const m = await evaluatePolicyBundle(bundle({ cpuCheck: unpinned }), { blocks: 64 });
    expect(m.ok).toBe(false);
    expect(m.issues.join('\n')).toContain('pins no code hashes');
    const d = await evaluatePolicyBundle(bundle({ chainId: 31337, cpuCheck: unpinned }), { blocks: 64 });
    expect(d.ok).toBe(true);
  });
});

describe('readIntegrity without recorded circuits', () => {
  const local = getDeployment('local');
  // A client that answers every read the way the deployment says it should be, so only the circuits check can fail.
  const client = {
    getBlockNumber: async () => 5n,
    getBlock: async () => ({ timestamp: 99n }),
    getCode: async ({ address }: { address: string }) => (address === local.vaultImpl ? '0x6001' : '0x60'),
    readContract: async ({ functionName }: { functionName: string }) =>
      ({
        cpu: local.cpu,
        policyId: local.policyId,
        vaultImpl: local.vaultImpl,
        treasury: local.treasury,
        earlyFee: 1n,
      })[functionName],
  } as unknown as PublicClient;
  const deployment = (over: Partial<Deployment>): Deployment => ({
    ...local,
    circuits: null,
    tapeout: null,
    vaultImplCodehash: keccak256('0x6001'),
    ...over,
  });

  it('fails on X Layer mainnet without TapeOut info or circuits', async () => {
    const r = await readIntegrity(client, deployment({ chainId: 196 }), 2);
    expect(r.ok).toBe(false);
    expect(r.checks.filter((c) => !c.ok)).toEqual([
      { name: 'deployment.tapeout', ok: false, expected: 'present', actual: 'missing' },
      { name: 'deployment.circuits', ok: false, expected: 'present', actual: 'missing' },
    ]);
  });

  it('stays unchanged on the devnet', async () => {
    const r = await readIntegrity(client, deployment({ chainId: 31337 }), 2);
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
