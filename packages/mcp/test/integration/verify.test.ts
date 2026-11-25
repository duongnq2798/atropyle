import {
  type AtropyleClient,
  AtropyleError,
  type PolicyVerification,
  type VaultVerification,
  type Warning,
} from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { VerifyOutputSchema, verify } from '../../src/ops/index';
import { account, atropyle, devnet } from './env';

describe('verify on the devnet', () => {
  it('cannot prove the policy of the mock CPU, and says so', async () => {
    const out = await verify(atropyle(), {});
    expect(VerifyOutputSchema.parse(out)).toEqual(out);
    expect(out).toMatchObject({ ok: false, policyStatus: 'unavailable', policyError: { code: 'POLICY_UNAVAILABLE' } });
  });

  it('checks a vault without the policy proof, and warns about a single RPC', async () => {
    const out = await verify(atropyle(), { vault: devnet().vaults.simple, policy: false });
    expect(out).toMatchObject({
      ok: true,
      target: 'vault',
      policyStatus: 'skipped',
      vault: { ok: true, state: 'active' },
    });
    expect(out.warnings.map((w) => w.code)).toContain('SINGLE_RPC');
  });

  it('an address that is not a vault is NOT_VAULT', async () => {
    await expect(verify(atropyle(), { vault: account(6), policy: false })).rejects.toMatchObject({
      code: 'NOT_VAULT',
    });
  });

  // The vault branch with a rewritten SDK result: the real snapshot and timeline of a devnet vault, but chosen
  // checks, policy part and warnings.
  const SINGLE = { code: 'SINGLE_RPC', message: 'One operator.' } as Warning;
  const POLICY: PolicyVerification = {
    ok: true,
    properties: Object.fromEntries(
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((k) => [k, { ok: true, violations: 0 }]),
    ) as PolicyVerification['properties'],
    combos: 67_108_864,
    ms: 1000,
    netlists: [],
    cpu: account(3),
    policyId: 1n,
    beaconFrozen: null,
    cpuCheck: null,
    p9: null,
    chainId: 31337,
    blockNumber: 5n,
    rpcs: 2,
    issues: [],
    firstFailures: [],
    warnings: [SINGLE],
  };
  function rewritten(policy: () => Promise<PolicyVerification>, change: (v: VaultVerification) => VaultVerification) {
    const atro = atropyle();
    return {
      ...atro,
      deployment: atro.deployment,
      verifyPolicy: policy,
      vault: (a: string) => ({
        ...atro.vault(a),
        verify: async () => change(await atro.vault(a).verify({ policy: false })),
      }),
    } as unknown as AtropyleClient;
  }

  it('a failing vault check fails the result and is named in the summary', async () => {
    const atro = rewritten(
      async () => POLICY,
      (v) => ({
        ...v,
        ok: false,
        checks: [{ name: 'vault.cpu', ok: false }],
        policy: { status: 'verified', result: POLICY, unchanged: true },
      }),
    );
    const out = await verify(atro, { vault: devnet().vaults.simple });
    expect(VerifyOutputSchema.parse(out)).toEqual(out);
    expect(out.ok).toBe(false);
    expect(out.vault).toMatchObject({ ok: false, unchanged: true });
    expect(out.summary).toContain('FAILS: vault.cpu');
  });

  it('maps the policy part of the vault to unchanged: true, false or null', async () => {
    const part = (policy: VaultVerification['policy']) =>
      verify(
        rewritten(
          async () => POLICY,
          (v) => ({ ...v, policy }),
        ),
        { vault: devnet().vaults.simple },
      );
    expect((await part({ status: 'verified', result: POLICY, unchanged: false })).vault?.unchanged).toBe(false);
    expect((await part({ status: 'verified', result: POLICY, unchanged: true })).vault?.unchanged).toBe(true);
    expect((await part({ status: 'skipped' })).vault?.unchanged).toBeNull();
  });

  it('merges and dedupes the warnings of the policy and the vault', async () => {
    const other = { code: 'NO_GUARDIANS', message: 'Another.' } as Warning;
    const atro = rewritten(
      async () => POLICY,
      (v) => ({ ...v, warnings: [SINGLE, other] }),
    );
    const out = await verify(atro, { vault: devnet().vaults.simple });
    expect(out.warnings.map((w) => w.code)).toEqual(['SINGLE_RPC', 'NO_GUARDIANS']);
  });

  it('a vault check with an unavailable policy still reports the vault, and fails', async () => {
    const atro = rewritten(
      async () => Promise.reject(new AtropyleError('POLICY_UNAVAILABLE')),
      (v) => v,
    );
    const out = await verify(atro, { vault: devnet().vaults.simple });
    expect(out).toMatchObject({
      ok: false,
      target: 'vault',
      policyStatus: 'unavailable',
      vault: { ok: true, unchanged: null },
    });
  });
});
