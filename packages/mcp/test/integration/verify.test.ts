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
});
