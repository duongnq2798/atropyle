import { describe, expect, it } from 'vitest';
import { account, cli, DEP, devnet, expectSchema, json } from './helpers';

describe('atropyle verify', () => {
  it('exits 3 when the policy cannot be proven (the devnet runs a mock CPU)', async () => {
    const r = await cli(['verify', '--json', ...DEP()]);
    expect(r.code, r.stdout).toBe(3);
    const out = json(r);
    expectSchema('verify', out);
    expect(out).toMatchObject({ ok: false, policyStatus: 'unavailable', policyError: { code: 'POLICY_UNAVAILABLE' } });
  });

  it('checks a vault without the proof, with one operator given on the command line', async () => {
    const args = [
      'verify',
      '--vault',
      devnet().vaults.simple,
      '--no-policy',
      '--verify-rpc',
      devnet().rpcUrl,
      '--single-rpc',
    ];
    const r = await cli([...args, '--json', ...DEP()]);
    expect(r.code, r.stdout).toBe(0);
    const out = json(r);
    expectSchema('verify', out);
    expect(out).toMatchObject({ ok: true, target: 'vault', policyStatus: 'skipped', rpcs: 1, vault: { ok: true } });
    expect(out.operators).toEqual([[new URL(devnet().rpcUrl).host]]);
    expect(out.warnings.map((w: { code: string }) => w.code)).toContain('SINGLE_RPC');
  });

  it('names operators by host only in the human output', async () => {
    const keyed = `${devnet().rpcUrl}/?apikey=key-abc123`;
    const r = await cli(['verify', '--vault', devnet().vaults.simple, '--no-policy', '--verify-rpc', keyed, ...DEP()]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain(new URL(devnet().rpcUrl).host);
    expect(r.stdout + r.stderr).not.toContain('key-abc123');
  });

  it('exits 3 for an address that is not a vault, and 2 for --no-policy alone', async () => {
    const notVault = await cli(['verify', '--vault', account(6), '--no-policy', '--json', ...DEP()]);
    expect(notVault.code).toBe(3);
    expectSchema('verify', json(notVault));
    expect(json(notVault).error.code).toBe('NOT_VAULT');
    const alone = await cli(['verify', '--no-policy', '--json', ...DEP()]);
    expect(alone.code).toBe(2);
    expectSchema('verify', json(alone));
    expect(json(alone).error.code).toBe('INVALID_OPTIONS');
  });
});
