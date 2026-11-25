import { buildAll, stepBytes } from '@atropyle/circuits';
import {
  type Address,
  bytesToHex,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  getAddress,
  type Hex,
  hexToBytes,
  keccak256,
  type PublicClient,
} from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { cpuAbi } from '../../src/abi/index';
import { type Deployment, getDeployment } from '../../src/deployments/index';

// Fake runtime codes and the pins that match them: the real ones are only on X Layer.
const fake = vi.hoisted(() => {
  const CPU = '0x1111111111111111111111111111111111111111';
  const IMPL = '0x5555555555555555555555555555555555555555';
  return {
    CPU,
    IMPL,
    MC3_CODE: '0x6080604052',
    PROXY_CODE: '0x6001600155',
    IMPL_CODE: '0x6002600255',
  } as const;
});
vi.mock('../../src/verify/pins', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/verify/pins')>();
  const { getAddress: addr, keccak256: hash } = await import('viem');
  const pins = {
    196: {
      cpu: addr(fake.CPU),
      proxyCodehash: hash(fake.PROXY_CODE),
      implementation: addr(fake.IMPL),
      implementationCodehash: hash(fake.IMPL_CODE),
    },
  };
  return {
    ...real,
    CODE_PINS: pins,
    codePinFor: (chainId: number, cpu: string) => {
      const p = pins[chainId as 196];
      return p && p.cpu.toLowerCase() === cpu.toLowerCase() ? p : null;
    },
    MULTICALL3_CODEHASH: hash(fake.MC3_CODE),
  };
});

const { MULTICALL3 } = await import('../../src/verify/pins');
const { readCpuCheck } = await import('../../src/verify/cpu');
const { readIntegrity } = await import('../../src/verify/integrity');
const { evaluateP9, MAX_SEED, P9_VECTORS, p9Vectors, randomSeed, readP9, vectorBytes } = await import(
  '../../src/verify/vectors'
);

const CPU = getAddress(fake.CPU);
const IMPL = getAddress(fake.IMPL);
const BEACON = getAddress('0x2222222222222222222222222222222222222222');
const TRANSISTORS = getAddress('0x4444444444444444444444444444444444444444');
const FACTORY = getAddress('0x3333333333333333333333333333333333333333');
const ZERO = getAddress('0x0000000000000000000000000000000000000000');
const POLICY_ID = 3n;
const program = buildAll().program;

const aggregate3Abi = [
  {
    type: 'function',
    name: 'aggregate3',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const;

const revert = () => Object.assign(new Error('execution reverted'), { code: 3, data: '0x' });
const rateLimit = () => Object.assign(new Error('limit exceeded'), { code: -32005 });

interface Behaviour {
  /** Code at the Multicall3 address: the (fake) canonical code by default. */
  mc3Code?: Hex;
  /** aggregate3 itself fails like this (a revert, or a node's eth_call gas cap). */
  aggregateFails?: () => Error;
  /**
   * The entry at this position of a batch fails inside aggregate3 while aggregate3 succeeds, as the last step() does
   * when the node's eth_call gas cap is just below what the batch needs. The same step() alone succeeds.
   */
  outOfGasInBatch?: (position: number) => boolean;
  /** The first n eth_call requests fail with a rate limit. */
  flakyCalls?: number;
  /** Rewrites the answer to the step() of one vector, by its packed state and inputs. */
  answer?: (state: Hex, inputs: Hex, a: { next: Hex; out: Hex }) => { next: Hex; out: Hex } | 'revert';
  /** Every request fails like this. */
  fail?: () => Error;
}

/** One RPC operator in front of a processor that runs this repository's policy. */
function operator(b: Behaviour = {}) {
  const log: { method: string; to?: string; block?: string }[] = [];
  let flaky = b.flakyCalls ?? 0;
  const step = (data: Hex): { ok: boolean; data: Hex } => {
    const { args } = decodeFunctionData({ abi: cpuAbi, data });
    const [id, state, inputs] = args as [bigint, Hex, Hex];
    if (id !== POLICY_ID) return { ok: false, data: '0x' };
    const r = stepBytes(program, hexToBytes(state), hexToBytes(inputs));
    const a = { next: bytesToHex(r.next), out: bytesToHex(r.out) };
    const got = b.answer ? b.answer(state, inputs, a) : a;
    if (got === 'revert') return { ok: false, data: '0x' };
    return { ok: true, data: encodeFunctionResult({ abi: cpuAbi, functionName: 'step', result: [got.next, got.out] }) };
  };
  const request = async ({ method, params }: { method: string; params?: unknown }) => {
    const p = (params ?? []) as [{ to?: string; data?: Hex }, string];
    log.push({ method, to: p[0]?.to, block: p[1] });
    if (b.fail) throw b.fail();
    if (method === 'eth_chainId') return '0xc4';
    if (method === 'eth_getCode') return b.mc3Code ?? fake.MC3_CODE;
    if (method !== 'eth_call') throw new Error(`unexpected ${method}`);
    if (flaky > 0) {
      flaky--;
      throw rateLimit();
    }
    const { to, data } = p[0] as { to: string; data: Hex };
    if (to.toLowerCase() === MULTICALL3.toLowerCase()) {
      if (b.aggregateFails) throw b.aggregateFails();
      const { args } = decodeFunctionData({ abi: aggregate3Abi, data });
      const calls = args[0] as readonly { target: Address; allowFailure: boolean; callData: Hex }[];
      const results = calls.map((c, position) => {
        if (b.outOfGasInBatch?.(position)) return { success: false, returnData: '0x' as Hex };
        const r = step(c.callData);
        return { success: r.ok, returnData: r.data };
      });
      return encodeFunctionResult({ abi: aggregate3Abi, functionName: 'aggregate3', result: results });
    }
    const r = step(data);
    if (!r.ok) throw revert();
    return r.data;
  };
  // retryCount 0: viem would otherwise retry every mocked revert with backoff; readP9 has its own retries.
  const transport = custom({ request }, { retryCount: 0 });
  const client = createPublicClient({ transport, cacheTime: 0, ccipRead: false }) as PublicClient;
  return { client, log };
}

const quick = { retryDelayMs: 0 };

describe('P9 vectors', () => {
  it('are the low 26 bits of keccak256(abi.encode(seed, i)), checked against cast', () => {
    // cast keccak $(cast abi-encode "f(uint256,uint256)" <seed> <i>), low 26 bits: state = bits 0-2, inputs = bits 3-25
    expect(p9Vectors(0n).slice(0, 2)).toEqual([
      { state: 5, inputs: 7818230 },
      { state: 1, inputs: 4684137 },
    ]);
    expect(p9Vectors(42n)[63]).toEqual({ state: 4, inputs: 4561479 });
    expect(p9Vectors(MAX_SEED)[7]).toEqual({ state: 6, inputs: 1472143 });
    expect(p9Vectors(42n)).toHaveLength(P9_VECTORS);
    expect(p9Vectors(42n)).toEqual(p9Vectors(42n));
  });

  it('packs a vector as step() takes it', () => {
    expect(vectorBytes({ state: 5, inputs: 0x7a_bc_de })).toEqual({ state: '0x05', inputs: '0xdebc7a' });
  });

  it('refuses a seed outside 0 to 2^64 - 1, and draws random seeds in range', () => {
    expect(() => p9Vectors(-1n)).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }));
    expect(() => p9Vectors(MAX_SEED + 1n)).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }));
    const seeds = new Set(Array.from({ length: 8 }, randomSeed));
    expect(seeds.size).toBe(8);
    for (const s of seeds) expect(s >= 0n && s <= MAX_SEED).toBe(true);
  });
});

describe('readP9 + evaluateP9', () => {
  it('batches 16 step() calls per Multicall3 call, at the given block, on each operator', async () => {
    const a = operator();
    const b = operator();
    const reads = await readP9([a.client, b.client], CPU, POLICY_ID, 77n, 9n, quick);
    expect(reads.operators.map((o) => [o.operator, o.blockNumber, o.multicall, o.calls])).toEqual([
      [1, 77n, true, 4],
      [2, 77n, true, 4],
    ]);
    for (const op of [a, b]) {
      expect(op.log.map((x) => x.method)).toEqual(['eth_getCode', ...Array(4).fill('eth_call')]);
      expect(op.log.every((x) => x.block === '0x4d')).toBe(true);
    }
    const r = evaluateP9(program, reads);
    expect(r).toMatchObject({ ok: true, seed: 9n, vectors: 64, mismatches: [] });
    expect(r.operators.map((o) => o.matched)).toEqual([64, 64]);
  });

  it('falls back to one call per vector without Multicall3, or with other code at its address', async () => {
    for (const mc3Code of ['0x', '0x6000'] as Hex[]) {
      const a = operator({ mc3Code });
      const reads = await readP9([a.client], CPU, POLICY_ID, 77n, 9n, quick);
      expect(reads.operators[0]).toMatchObject({ multicall: false, calls: 64 });
      expect(a.log.filter((x) => x.method === 'eth_call').every((x) => x.to?.toLowerCase() === CPU.toLowerCase())).toBe(
        true,
      );
      expect(evaluateP9(program, reads).ok).toBe(true);
    }
  });

  it('falls back to single calls for a batch that Multicall3 cannot carry', async () => {
    const gasCap = () => Object.assign(new Error('gas required exceeds allowance (10000000)'), { code: -32000 });
    for (const aggregateFails of [revert, gasCap]) {
      const a = operator({ aggregateFails });
      const reads = await readP9([a.client], CPU, POLICY_ID, 77n, 9n, quick);
      expect(reads.operators[0]).toMatchObject({ multicall: false });
      expect(reads.operators[0].calls).toBeGreaterThanOrEqual(4 + 64);
      expect(evaluateP9(program, reads).ok).toBe(true);
    }
  });

  it('asks a step() that ran out of gas inside a batch again on its own, instead of reporting a revert', async () => {
    // Read-only probe on rpc.xlayer.tech, 25 Nov 2026: aggregate3 of 16 step() calls at 9.25M to 9.40M gas succeeded
    // with the 16th call failed; at 9.45M all 16 succeeded.
    const a = operator({ outOfGasInBatch: (position) => position === 15 });
    const reads = await readP9([a.client], CPU, POLICY_ID, 77n, 9n, quick);
    expect(reads.operators[0]).toMatchObject({ multicall: true, calls: 4 + 4 });
    const singles = a.log.filter((x) => x.method === 'eth_call' && x.to?.toLowerCase() === CPU.toLowerCase());
    expect(singles).toHaveLength(4);
    const r = evaluateP9(program, reads);
    expect(r).toMatchObject({ ok: true, mismatches: [] });
    expect(r.operators[0].matched).toBe(64);
  });

  it('counts every eth_call attempt, retries included', async () => {
    const a = operator({ flakyCalls: 2 });
    const reads = await readP9([a.client], CPU, POLICY_ID, 77n, 9n, quick);
    expect(reads.operators[0]).toMatchObject({ multicall: true, calls: 4 + 2 });
    expect(a.log.filter((x) => x.method === 'eth_call')).toHaveLength(6);
    expect(evaluateP9(program, reads).ok).toBe(true);
  });

  it('pins a wrong answer and a revert on the operator that gave them', async () => {
    const vectors = p9Vectors(9n);
    const target = vectorBytes(vectors[3]);
    const reverting = vectorBytes(vectors[10]);
    const honest = operator();
    const liar = operator({
      answer: (state, inputs, a) => {
        if (state === target.state && inputs === target.inputs) return { ...a, next: '0x06' };
        if (state === reverting.state && inputs === reverting.inputs) return 'revert';
        return a;
      },
    });
    const r = evaluateP9(program, await readP9([honest.client, liar.client], CPU, POLICY_ID, 77n, 9n, quick));
    expect(r.ok).toBe(false);
    expect(r.operators.map((o) => o.matched)).toEqual([64, 62]);
    // The entry that failed inside its batch was asked again on its own, where it reverted too.
    expect(r.operators.map((o) => o.calls)).toEqual([4, 5]);
    expect(r.mismatches.map((m) => [m.operator, m.index, m.next, m.error])).toEqual([
      [2, 3, '0x06', null],
      [2, 10, null, 'reverted'],
    ]);
    expect(r.mismatches[0]).toMatchObject({ state: vectors[3].state, inputs: vectors[3].inputs });
  });

  it('does the same through single calls', async () => {
    const vectors = p9Vectors(9n);
    const target = vectorBytes(vectors[20]);
    const liar = operator({
      mc3Code: '0x',
      answer: (state, inputs, a) => (state === target.state && inputs === target.inputs ? 'revert' : a),
    });
    const r = evaluateP9(program, await readP9([liar.client], CPU, POLICY_ID, 77n, 9n, quick));
    expect(r.mismatches.map((m) => [m.operator, m.index, m.error])).toEqual([[1, 20, 'reverted']]);
  });

  it('throws an RPC failure instead of reporting it as a mismatch', async () => {
    const dead = operator({ fail: rateLimit });
    await expect(readP9([dead.client], CPU, POLICY_ID, 77n, 9n, quick)).rejects.toMatchObject({
      code: 'RPC_RATE_LIMITED',
    });
  });

  it('cannot pass without a compiled program', async () => {
    const reads = await readP9([operator().client], CPU, POLICY_ID, 77n, 9n, quick);
    expect(evaluateP9(null, reads)).toMatchObject({ ok: false, mismatches: [] });
  });
});

describe('code pins', () => {
  const tapeout = {
    factory: FACTORY,
    beacon: BEACON,
    beaconSlot: `0x${'00'.repeat(32)}` as const,
    name: 'Atropyle',
    symbol: 'ATRO',
  };
  const mainnet: Deployment = { ...getDeployment('local'), chainId: 196, tapeout, cpu: CPU };

  /** A client for readCpuCheck and readIntegrity, with the given runtime code per address. */
  function chain(code: Record<string, Hex>, implementation: Address = IMPL): PublicClient {
    const answers: Record<string, unknown> = {
      isCPU: true,
      name: 'Atropyle',
      symbol: 'ATRO',
      transistors: TRANSISTORS,
      owner: ZERO,
      circuits: CPU,
      implementation,
      cpu: CPU,
      policyId: mainnet.policyId,
      vaultImpl: mainnet.vaultImpl,
      treasury: mainnet.treasury,
      earlyFee: 1n,
    };
    return {
      getBlockNumber: async () => 5n,
      getBlock: async () => ({ timestamp: 99n }),
      getStorageAt: async () => `0x${'00'.repeat(12)}${BEACON.slice(2)}`,
      getCode: async ({ address }: { address: string }) => code[address.toLowerCase()] ?? '0x6000',
      readContract: async ({ functionName }: { functionName: string }) => answers[functionName],
    } as unknown as PublicClient;
  }
  const pinned = { [CPU.toLowerCase()]: fake.PROXY_CODE, [IMPL.toLowerCase()]: fake.IMPL_CODE } as Record<string, Hex>;

  it('readCpuCheck matches the pinned proxy and implementation code', async () => {
    const r = await readCpuCheck(chain(pinned), mainnet, CPU, 5n);
    expect(r.ok).toBe(true);
    expect(r.code).toEqual({
      proxyCodehash: keccak256(fake.PROXY_CODE),
      implementation: IMPL,
      implementationCodehash: keccak256(fake.IMPL_CODE),
      expected: {
        proxyCodehash: keccak256(fake.PROXY_CODE),
        implementation: IMPL,
        implementationCodehash: keccak256(fake.IMPL_CODE),
      },
      matches: true,
    });
  });

  it('readCpuCheck fails on other proxy code, another implementation or other implementation code', async () => {
    const otherProxy = await readCpuCheck(chain({ ...pinned, [CPU.toLowerCase()]: '0x60ff' }), mainnet, CPU, 5n);
    expect(otherProxy).toMatchObject({ ok: false, code: { matches: false } });
    const otherImpl = await readCpuCheck(chain(pinned, TRANSISTORS), mainnet, CPU, 5n);
    expect(otherImpl).toMatchObject({ ok: false, code: { implementation: TRANSISTORS, matches: false } });
    const otherCode = await readCpuCheck(chain({ ...pinned, [IMPL.toLowerCase()]: '0x60ff' }), mainnet, CPU, 5n);
    expect(otherCode).toMatchObject({ ok: false, code: { matches: false } });
  });

  it('readCpuCheck leaves an unpinned CPU to the caller', async () => {
    const r = await readCpuCheck(chain(pinned), { ...mainnet, chainId: 31337 }, CPU, 5n);
    expect(r).toMatchObject({ ok: true, code: { expected: null, matches: null } });
  });

  it('readIntegrity checks the pins on mainnet, and fails a CPU it has no pin for', async () => {
    const d = { ...mainnet, vaultImplCodehash: keccak256('0x6000'), circuits: null };
    const r = await readIntegrity(chain(pinned), d, 2);
    const byName = Object.fromEntries(r.checks.map((c) => [c.name, c.ok]));
    expect(byName).toMatchObject({ 'cpu.codehash': true, 'cpuImpl.address': true, 'cpuImpl.codehash': true });
    const bad = await readIntegrity(chain({ ...pinned, [IMPL.toLowerCase()]: '0x60ff' }), d, 2);
    expect(bad.checks.find((c) => c.name === 'cpuImpl.codehash')).toMatchObject({
      ok: false,
      expected: keccak256(fake.IMPL_CODE),
      actual: keccak256('0x60ff'),
    });
    const other = getAddress('0x7777777777777777777777777777777777777777');
    const unpinned = await readIntegrity(chain(pinned), { ...d, cpu: other }, 2);
    expect(unpinned.checks.find((c) => c.name === 'cpu.codehash')).toMatchObject({ ok: false, expected: 'pinned' });
  });
});
