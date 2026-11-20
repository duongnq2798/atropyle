import { describe, expect, it } from 'vitest';
import {
  CheckPlanOutputSchema,
  checkPlan,
  GetVaultOutputSchema,
  getVault,
  listVaults,
  SimulateOutputSchema,
  simulate,
} from '../../src/ops/index';
import { account, atropyle, devnet } from './env';

const withoutUntrusted = (o: { untrusted: unknown }) => {
  const { untrusted: _u, ...rest } = o;
  return JSON.stringify(rest);
};

describe('read operations on the devnet', () => {
  it('getVault explains a vault in grace and gives the roles of `as`', async () => {
    const out = await getVault(atropyle(), { vault: devnet().vaults.grace, as: account(2) });
    expect(GetVaultOutputSchema.parse(out)).toEqual(out);
    expect(out.status.state).toBe('grace');
    expect(out.roles).toEqual(['heir']);
    expect(out.explanation[0]).toMatch(/^Grace\./);
    expect(out.summary).toContain(devnet().vaults.grace);
  });

  it('token names from hostile contracts end up only in untrusted', async () => {
    const out = await getVault(atropyle(), { vault: devnet().vaults.hostile });
    expect(out.status.assets.map((a) => [a.token.symbol, a.token.name])).toEqual([
      [null, null],
      [null, null],
      [null, null],
    ]);
    const texts = out.untrusted.texts;
    expect(texts.find((t) => t.path === '/status/assets/0/token/name')?.value).toMatch(/^Ignore previous instructions/);
    expect(texts.find((t) => t.path === '/status/assets/1/token/name')?.truncated).toBe(true);
    expect(texts.find((t) => t.path === '/status/assets/2/token/name')).toBeDefined();
    expect(texts.every((t) => Array.from(t.value).length <= 65)).toBe(true);
    expect(withoutUntrusted(out)).not.toMatch(/Ignore previous|very long token name/i);
  });

  it('listVaults gives each vault with the roles of the account', async () => {
    const { vaults } = devnet();
    const owner = await listVaults(atropyle(), { account: account(1) });
    expect(owner.vaults.map((v) => v.vault).sort()).toEqual(
      [vaults.simple, vaults.guarded, vaults.grace, vaults.hostile].sort(),
    );
    expect(owner.vaults.every((v) => v.roles.includes('owner'))).toBe(true);
    const guardian = await listVaults(atropyle(), { account: account(3) });
    expect(guardian.vaults.map((v) => [v.vault, v.roles])).toEqual([[vaults.guarded, ['guardian']]]);
  });

  it('simulate predicts a check-in that cancels the alarm', async () => {
    const out = await simulate(atropyle(), {
      vault: devnet().vaults.grace,
      action: { type: 'checkIn' },
      as: account(1),
    });
    expect(SimulateOutputSchema.parse(out)).toEqual(out);
    expect(out.mode).toBe('action');
    expect(out.effect).toMatchObject({ from: 'grace', next: 'active', cancel: true });
    expect(out.simulation).toMatchObject({ ok: true });
    expect(out.summary).toContain('grace -> active');
  });

  it('simulate in plan mode previews the timeline of a vault that does not exist yet', async () => {
    const plan = { version: 1 as const, heirs: [{ account: account(6) }], timing: 'drill' as const, drill: true };
    const out = await simulate(atropyle(), { plan, as: account(1) });
    expect(out.mode).toBe('plan');
    expect(out.vault).toBeNull();
    expect(out.config?.timing).toEqual({ period: 60, threshold: 2, window: 120 });
    const kinds = out.timeline?.events.map((e) => e.kind) ?? [];
    expect(kinds).toContain('alarm');
    expect(kinds).toContain('release');
    const release = out.timeline?.events.find((e) => e.kind === 'release');
    expect(BigInt(release?.at ?? 0) - BigInt(out.at ?? 0)).toBeGreaterThanOrEqual(240n);
    expect(out.summary).toMatch(/^If the owner never checks in/);
  });

  it('simulate needs either a plan or a vault and an action', async () => {
    await expect(simulate(atropyle(), { as: account(1) })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });

  it('checkPlan returns issues instead of throwing, and checks hostile tokens on-chain', async () => {
    const bad = await checkPlan(atropyle(), { plan: { heirs: [], timing: 'drill' }, owner: account(1), drill: true });
    expect(bad.ok).toBe(false);
    expect(bad.issues.map((i) => i.code)).toContain('HEIRS_COUNT');

    const plan = {
      heirs: [{ account: account(6) }],
      timing: 'drill' as const,
      assets: [{ kind: 'erc20' as const, token: devnet().tokens.injection }],
    };
    const out = await checkPlan(atropyle(), { plan, owner: account(1), drill: true });
    expect(CheckPlanOutputSchema.parse(out)).toEqual(out);
    expect(out.ok).toBe(true);
    expect(out.tokens[0].info?.name).toBeNull();
    expect(withoutUntrusted(out)).not.toContain('Ignore previous');
  });

  it('checkPlan asks for an owner when neither the plan nor the input has one', async () => {
    await expect(
      checkPlan(atropyle(), { plan: { heirs: [{ account: account(6) }], timing: 'drill' } }),
    ).rejects.toMatchObject({
      code: 'PLAN_INVALID',
    });
  });

  it('checkPlan blames the file for a bad plan owner and the argument for a bad owner argument', async () => {
    const plan = { owner: 'nope', heirs: [{ account: account(6) }], timing: 'drill' as const };
    const fromFile = await checkPlan(atropyle(), { plan }).catch((e) => e);
    expect(fromFile).toMatchObject({ code: 'PLAN_INVALID' });
    expect(JSON.stringify(fromFile.details)).toContain('"/owner"');
    await expect(checkPlan(atropyle(), { plan, owner: 'nope' })).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });
});
