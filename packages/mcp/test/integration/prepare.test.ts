import { createAtropyle } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { OKX_NOTE, PrepareOutputSchema, prepareAction, prepareCreateVault } from '../../src/ops/index';
import { account, atropyle, devnet } from './env';

const withoutUntrusted = (o: { untrusted: unknown }) => {
  const { untrusted: _u, ...rest } = o;
  return JSON.stringify(rest);
};

describe('prepare operations on the devnet', () => {
  it('prepares a Drill from a plan, with a link, cast commands and wallet_sendCalls', async () => {
    const plan = {
      version: 1 as const,
      owner: account(1),
      drill: true,
      heirs: [
        { account: account(6), percent: 70 },
        { account: account(8), percent: 30 },
      ],
      timing: 'drill' as const,
      assets: [{ kind: 'erc20' as const, token: devnet().feeTokens[0] }],
    };
    const out = await prepareCreateVault(atropyle(), { plan });
    expect(PrepareOutputSchema.parse(out)).toEqual(out);
    expect(out.action).toBe('createVault');
    expect(out.blocked).toBeNull();
    expect(out.plan.steps.map((s) => s.action)).toEqual(expect.arrayContaining(['approve', 'createVault']));
    expect(out.handoff?.link).toMatch(/^http:\/\/localhost:5173\/?#\/sign\?p=/);
    expect(out.handoff?.okxAppLink).toBeNull();
    expect(out.handoff?.cast).toHaveLength(out.plan.steps.length);
    expect(out.handoff?.cast[0]).toMatch(/^cast send 0x[0-9a-fA-F]{40} 0x[0-9a-f]+ --from /);
    expect(out.handoff?.calls.calls).toHaveLength(out.plan.steps.length);
    expect(out.summary).toContain(`for ${account(1)} to sign on chain 31337`);
  });

  it('gives one OKX Agentic Wallet command per step, with the two-step note', async () => {
    const out = await prepareAction(atropyle(), {
      vault: devnet().vaults.simple,
      action: { type: 'checkIn' },
      as: account(1),
    });
    const steps = out.plan.steps;
    expect(out.handoff?.okx).toEqual(
      steps.map((s) => `onchainos wallet contract-call --chain 31337 --to ${s.to} --input-data ${s.data}`),
    );
    expect(out.handoff?.notes).toContain(OKX_NOTE);
    expect(OKX_NOTE).toContain('--force only after they agree');
  });

  it('an https webUrl also gives the OKX App link', async () => {
    const out = await prepareAction(atropyle(), {
      vault: devnet().vaults.simple,
      action: { type: 'checkIn' },
      as: account(1),
      webUrl: 'https://app.atropyle.test/',
    });
    expect(out.handoff?.link).toMatch(/^https:\/\/app\.atropyle\.test\/#\/sign\?p=/);
    expect(out.handoff?.okxAppLink).toMatch(
      /^https:\/\/web3\.okx\.com\/download\?deeplink=okx%3A%2F%2Fwallet%2Fdapp%2Furl/,
    );
  });

  it('guardian actions always carry the anti-phishing warning', async () => {
    for (const action of [
      { type: 'attestDeath' as const, on: true },
      { type: 'voteRecovery' as const, target: account(6) },
    ]) {
      const out = await prepareAction(atropyle(), { vault: devnet().vaults.guarded, action, as: account(3) });
      expect(out.warnings.map((w) => w.code)).toContain('GUARDIAN_VERIFY_OUT_OF_BAND');
    }
  });

  it('no handoff when a step fails simulation', async () => {
    const out = await prepareAction(atropyle(), {
      vault: devnet().vaults.guarded,
      action: { type: 'voteRecovery', target: account(8) },
      as: account(6),
    });
    expect(PrepareOutputSchema.parse(out)).toEqual(out);
    expect(out.handoff).toBeNull();
    expect(out.blocked).toMatchObject({ step: 0, action: 'voteRecovery', error: { code: 'NOT_GUARDIAN' } });
    expect(out.summary).toContain('fails in simulation with NOT_GUARDIAN, so there is nothing to sign');
  });

  it('rejects an invalid plan with PLAN_INVALID and every issue', async () => {
    await expect(
      prepareCreateVault(atropyle(), { plan: { heirs: [], timing: 'drill' }, owner: account(1), drill: true }),
    ).rejects.toMatchObject({ code: 'PLAN_INVALID', details: { issues: expect.any(Array) } });
  });

  it('approvals of hostile tokens keep their names out of every summary', async () => {
    const { tokens } = devnet();
    const plan = {
      heirs: [{ account: account(6) }],
      timing: 'drill' as const,
      assets: [tokens.injection, tokens.long, tokens.binary].map((token) => ({ kind: 'erc20' as const, token })),
    };
    const out = await prepareCreateVault(atropyle(), { plan, owner: account(1), drill: true });
    expect(out.blocked).toBeNull();
    expect(withoutUntrusted(out)).not.toMatch(/Ignore previous|very long token name/i);
  });

  it('a deployment whose RPC URL carries a key still prepares, without cast commands', async () => {
    const { deployment } = atropyle();
    const keyed = { ...deployment, rpcUrls: deployment.rpcUrls.map((u) => `${u}?key=abc123`) };
    const out = await prepareAction(createAtropyle({ chain: keyed, builderCode: null }), {
      vault: devnet().vaults.simple,
      action: { type: 'checkIn' },
      as: account(1),
    });
    expect(out.blocked).toBeNull();
    expect(out.handoff?.link).toMatch(/#\/sign\?p=/);
    expect(out.handoff?.cast).toEqual([]);
    expect(out.handoff?.notes).toContain(
      "cast commands are omitted: the SDK refused to build them for this deployment's RPC URL",
    );
    expect(JSON.stringify(out)).not.toContain('abc123');
  });
});
