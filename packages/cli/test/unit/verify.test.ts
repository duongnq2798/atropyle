import { type VerifyOutput, verify } from '@atropyle/mcp/ops';
import { type AtropyleClient, AtropyleError, type Deployment, type PolicyVerification } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { verifyGroups } from '../../src/client';
import { formatVerify } from '../../src/format';
import { PLAIN } from '../../src/style';

const props = Object.fromEntries(
  ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((p) => [p, { ok: true, violations: 0 }]),
);
const POLICY = {
  ok: true,
  properties: props,
  combos: 67_108_864,
  ms: 54_200,
  netlists: [
    {
      id: 7n,
      role: 'policy',
      keccak: `0x${'ab'.repeat(32)}`,
      gates: 312,
      matchesSource: true,
      matchesDeployment: true,
    },
  ],
  cpu: '0x1000000000000000000000000000000000000003',
  policyId: 1n,
  beaconFrozen: true,
  cpuCheck: null,
  p9: null,
  chainId: 196,
  blockNumber: 123n,
  rpcs: 2,
  issues: [],
  firstFailures: [],
  warnings: [],
} as unknown as PolicyVerification;

const stub = (verifyPolicy: () => Promise<PolicyVerification>) =>
  ({
    deployment: { chainId: 196, quorumRpcUrls: [['https://rpc.xlayer.tech/key-abc123'], ['https://xlayer.drpc.org']] },
    verifyPolicy,
  }) as unknown as AtropyleClient;

describe('formatVerify', () => {
  it('prints the property table, netlists, beacon, operators and timing', async () => {
    const out = await verify(
      stub(async () => POLICY),
      {},
    );
    const text = formatVerify(out, PLAIN);
    for (let i = 1; i <= 8; i++) expect(text).toMatch(new RegExp(`P${i}\\s+holds\\s+0`));
    expect(text).toContain('312 gates');
    expect(text).toContain(`keccak 0x${'ab'.repeat(32)}`);
    expect(text).toContain('matches source: yes');
    expect(text).toContain('beacon frozen: yes');
    expect(text).toContain('rpc.xlayer.tech | xlayer.drpc.org');
    expect(text).not.toContain('key-abc123');
    expect(JSON.stringify(out)).not.toContain('key-abc123');
    expect(text).toContain('67,108,864 combinations in 54.2 s');
    expect(text).toContain('at block 123');
  });

  it('says why the policy is not proven', async () => {
    const out = await verify(
      stub(async () => Promise.reject(new AtropyleError('POLICY_UNAVAILABLE'))),
      {},
    );
    const text = formatVerify(out, PLAIN);
    expect(out.ok).toBe(false);
    expect(text).toContain('Policy not proven: POLICY_UNAVAILABLE');
  });

  const policyWith = (over: Record<string, unknown>) =>
    verify(
      stub(async () => ({ ...POLICY, ...over }) as unknown as PolicyVerification),
      {},
    );

  it('shows a failing property, an issue and a counterexample', async () => {
    const properties = { ...props, P3: { ok: false, violations: 2 } };
    const out = await policyWith({
      ok: false,
      properties,
      issues: ['netlist 7 differs'],
      firstFailures: [{ state: 1, inputs: 2, next: 3, out: 4, expectNext: 5, expectOut: 6, violations: 7 }],
    });
    const text = formatVerify(out, PLAIN);
    expect(text).toMatch(/P3\s+FAILS\s+2/);
    expect(text).toContain('issue: netlist 7 differs');
    expect(text).toContain(
      'counterexample: {"state":1,"inputs":2,"next":3,"out":4,"expectNext":5,"expectOut":6,"violations":7}',
    );
  });

  it('does not call a property that never ran a failure', async () => {
    const properties = { ...props, P5: { ok: false, violations: 0 } };
    const text = formatVerify(await policyWith({ ok: false, properties }), PLAIN);
    expect(text).toMatch(/P5\s+not run\s+0/);
    expect(text).not.toContain('FAILS');
  });

  it('says the proof was skipped with --no-policy, and omits a missing block', () => {
    const skipped = {
      ok: true,
      chainId: 196,
      blockNumber: null,
      rpcs: 1,
      operators: [['a.test']],
      policy: null,
      policyError: null,
      vault: null,
      warnings: [],
      summary: 'Policy proof skipped.',
      untrusted: { notice: '', texts: [] },
    } as unknown as VerifyOutput;
    const text = formatVerify(skipped, PLAIN);
    expect(text).toContain('Policy proof skipped (--no-policy)');
    expect(text).not.toContain('at block');
  });

  const HASH = (b: string) => `0x${b.repeat(32)}`;
  const P9 = {
    ok: true,
    seed: 42n,
    vectors: 64,
    operators: [
      { operator: 1, blockNumber: 123n, multicall: true, calls: 4, matched: 64 },
      { operator: 2, blockNumber: 123n, multicall: false, calls: 64, matched: 64 },
    ],
    mismatches: [],
    ms: 1_250,
  };
  const CPU_CHECK = {
    ok: true,
    isTapeoutCpu: true,
    nameMatches: true,
    symbolMatches: true,
    beacon: '0x1000000000000000000000000000000000000004',
    beaconMatches: true,
    beaconFrozen: true,
    transistorsPaired: true,
    code: {
      proxyCodehash: HASH('11'),
      implementation: '0x1000000000000000000000000000000000000005',
      implementationCodehash: HASH('22'),
      expected: {
        proxyCodehash: HASH('11'),
        implementation: '0x1000000000000000000000000000000000000005',
        implementationCodehash: HASH('22'),
      },
      matches: true,
    },
  };

  it('prints P9 with its seed and operators, and the pinned code hashes', async () => {
    const text = formatVerify(await policyWith({ p9: P9, cpuCheck: CPU_CHECK }), PLAIN);
    expect(text).toMatch(/P9\s+holds\s+0/);
    expect(text).toContain('P9: 64 vectors of seed 42 through step() on the processor in 1.3 s');
    expect(text).toContain('rerun them with --p9-seed 42');
    expect(text).toContain('operator #1 at block 123: 64 of 64 match the simulator (4 eth_call, through Multicall3)');
    expect(text).toContain('operator #2 at block 123: 64 of 64 match the simulator (64 eth_call, one at a time)');
    expect(text).toContain(`code keccak: proxy ${HASH('11')}`);
    expect(text).toContain(`implementation 0x1000000000000000000000000000000000000005 ${HASH('22')}`);
    expect(text).toContain('matches the pins: yes');
  });

  it('shows a P9 mismatch with its vector, and a code hash off its pin', async () => {
    const m = {
      operator: 2,
      index: 7,
      state: 6,
      inputs: 1_472_143,
      expectNext: '0x06',
      expectOut: '0x00',
      next: null,
      out: null,
      error: 'reverted',
    };
    const p9 = { ...P9, ok: false, operators: [P9.operators[0], { ...P9.operators[1], matched: 63 }], mismatches: [m] };
    const cpuCheck = {
      ...CPU_CHECK,
      ok: false,
      code: { ...CPU_CHECK.code, proxyCodehash: HASH('33'), matches: false },
    };
    const out = await policyWith({ ok: false, p9, cpuCheck, issues: ['P9: 1 of 64 vectors differ'] });
    const text = formatVerify(out, PLAIN);
    expect(out.ok).toBe(false);
    expect(text).toMatch(/P9\s+FAILS\s+1/);
    expect(text).toContain('operator #2 at block 123: 63 of 64 match the simulator');
    expect(text).toContain(`P9 mismatch: ${JSON.stringify(m)}`);
    expect(text).toContain('matches the pins: NO');
  });

  it('says P9 did not run when the SDK gave no P9 result, and when nothing is pinned', async () => {
    const cpuCheck = { ...CPU_CHECK, code: { ...CPU_CHECK.code, expected: null, matches: null } };
    const text = formatVerify(await policyWith({ cpuCheck }), PLAIN);
    expect(text).toMatch(/P9\s+not run\s+0/);
    expect(text).not.toContain('--p9-seed');
    expect(text).toContain('no pin for this processor');
  });

  it('keeps an API key in a --verify-rpc path out of the groups and the output', async () => {
    const dep = { quorumRpcUrls: [['https://a.test/']] } as unknown as Deployment;
    const keyed = 'https://rpc.example.test/key-abc123';
    const operators = verifyGroups(dep, { verifyRpc: [keyed, 'https://b.test/'] });
    expect(operators).toEqual([[keyed], ['https://b.test/']]);
    expect(verifyGroups(dep, { verifyRpc: [keyed, 'https://b.test/'], singleRpc: true })).toEqual([[keyed]]);
    const out = await verify(
      stub(async () => POLICY),
      {},
      { operators },
    );
    expect(out.operators).toEqual([['rpc.example.test'], ['b.test']]);
    expect(JSON.stringify(out)).not.toContain('key-abc123');
    expect(formatVerify(out, PLAIN)).not.toContain('key-abc123');
  });
});
