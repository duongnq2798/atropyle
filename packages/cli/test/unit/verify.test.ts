import { verify } from '@atropyle/mcp/ops';
import { type AtropyleClient, AtropyleError, type PolicyVerification } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
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
});
