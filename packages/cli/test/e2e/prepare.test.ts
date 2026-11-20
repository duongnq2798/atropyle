import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { account, cli, DEP, devnet, expectSchema, json, tmp } from './helpers';

function planDir(): string {
  const dir = tmp();
  const plan = {
    version: 1,
    owner: account(1),
    drill: true,
    heirs: [
      { account: account(6), percent: 70 },
      { account: account(8), percent: 30 },
    ],
    timing: 'drill',
    assets: [{ kind: 'erc20', token: devnet().feeTokens[0] }],
  };
  writeFileSync(join(dir, 'atropyle.plan.json'), JSON.stringify(plan, null, 2));
  return dir;
}

describe('atropyle prepare', () => {
  it('prepares create-vault from a plan file', async () => {
    const r = await cli(['prepare', 'create-vault', 'atropyle.plan.json', '--json', ...DEP()], { cwd: planDir() });
    expect(r.code, r.stdout).toBe(0);
    const out = json(r);
    expectSchema('prepare', out);
    expect(out.action).toBe('createVault');
    expect(out.handoff.link).toMatch(/#\/sign\?p=/);
    expect(out.handoff.cast).toHaveLength(out.plan.steps.length);
  });

  it('shows warnings before the link, and a QR code only when asked off a terminal', async () => {
    const args = ['prepare', 'attest-death', devnet().vaults.guarded, '--as', account(3), ...DEP()];
    const plain = await cli(args);
    expect(plain.code, plain.stdout).toBe(0);
    const warning = plain.stdout.indexOf('GUARDIAN_VERIFY_OUT_OF_BAND');
    expect(warning).toBeGreaterThan(0);
    expect(warning).toBeLessThan(plain.stdout.indexOf('#/sign?p='));
    expect(plain.stdout).not.toMatch(/[▀▄█]/u);
    const withQr = await cli([...args, '--qr']);
    expect(withQr.stdout).toMatch(/[▀▄█]/u);
  });

  it('prints only cast commands on stdout with --format cast', async () => {
    const r = await cli([
      'prepare',
      'check-in',
      devnet().vaults.simple,
      '--as',
      account(1),
      '--format',
      'cast',
      ...DEP(),
    ]);
    expect(r.code, r.stderr).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.startsWith('cast send '))).toBe(true);
    expect(r.stderr).toContain('to sign on chain 31337');
  });

  it('prints wallet_sendCalls parameters with --format calls', async () => {
    const r = await cli([
      'prepare',
      'check-in',
      devnet().vaults.simple,
      '--as',
      account(1),
      '--format',
      'calls',
      ...DEP(),
    ]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ version: '2.0.0', chainId: '0x7a69', from: account(1) });
  });

  it('adds the OKX App link for an https web app', async () => {
    const r = await cli([
      'prepare',
      'check-in',
      devnet().vaults.simple,
      '--as',
      account(1),
      '--web-url',
      'https://app.atropyle.test/',
      ...DEP(),
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Open in the OKX App:');
    expect(r.stdout).toContain('https://web3.okx.com/download?deeplink=');
  });

  it('prepare exits 1 without a link when the simulation fails', async () => {
    const args = [
      'prepare',
      'vote-recovery',
      devnet().vaults.guarded,
      '--target',
      account(8),
      '--as',
      account(6),
      ...DEP(),
    ];
    const human = await cli([...args, '--qr']);
    expect(human.code).toBe(1);
    expect(human.stdout).toContain('Nothing to sign');
    expect(human.stdout).not.toMatch(/#\/sign\?p=|cast send|[▀▄█]/u);
    const cast = await cli([...args, '--format', 'cast']);
    expect(cast.code).toBe(1);
    expect(cast.stdout).toBe('');
    const calls = await cli([...args, '--format', 'calls']);
    expect(calls.code).toBe(1);
    expect(calls.stdout).toBe('');
    const raw = await cli([...args, '--json']);
    expect(raw.code).toBe(1);
    const out = json(raw);
    expectSchema('prepare', out);
    expect(out).toMatchObject({ handoff: null, blocked: { action: 'voteRecovery', error: { code: 'NOT_GUARDIAN' } } });
  });

  it('--format json is --json, for the output and for errors', async () => {
    const ok = await cli([
      'prepare',
      'check-in',
      devnet().vaults.simple,
      '--as',
      account(1),
      '--format',
      'json',
      ...DEP(),
    ]);
    expect(ok.code).toBe(0);
    expectSchema('prepare', json(ok));
    const bad = await cli(['prepare', 'fly', devnet().vaults.simple, '--as', account(1), '--format', 'json', ...DEP()]);
    expect(bad.code).toBe(2);
    expect(json(bad)).toMatchObject({ error: { code: 'INVALID_OPTIONS' } });
  });

  it('exits 2 on a bad command line', async () => {
    const guarded = devnet().vaults.guarded;
    const vaultAction = (...flags: string[]) =>
      cli(['prepare', 'check-in', guarded, '--as', account(1), ...flags, ...DEP()]);
    expect((await cli(['prepare', 'fly', guarded, '--as', account(1), ...DEP()])).code).toBe(2);
    const proto = await cli(['prepare', 'constructor', guarded, '--as', account(1), '--json', ...DEP()]);
    expect(proto.code).toBe(2);
    expect(json(proto).error.message).toContain('create-vault');
    expect((await cli(['prepare', 'check-in', guarded, ...DEP()])).code).toBe(2);
    expect((await vaultAction('--format', 'qr')).code).toBe(2);
    expect((await vaultAction('--drill')).code).toBe(2);
    expect((await vaultAction('--fee-token', account(2))).code).toBe(2);
    expect((await vaultAction('--salt', `0x${'11'.repeat(32)}`)).code).toBe(2);
    expect((await vaultAction('--web-url', 'not-a-url')).code).toBe(2);
    const create = (...flags: string[]) =>
      cli(['prepare', 'create-vault', 'atropyle.plan.json', ...flags, ...DEP()], { cwd: planDir() });
    expect((await create('--at', '+1d')).code).toBe(2);
    expect((await create('--salt', '0x12')).code).toBe(2);
    expect((await create('--heir', account(2))).code).toBe(2);
  });

  it('checks flags before it reads the plan file', async () => {
    const r = await cli(['prepare', 'create-vault', 'missing.plan.json', '--salt', '0x12', ...DEP()]);
    expect(r.code).toBe(2);
    const missing = await cli(['prepare', 'create-vault', 'missing.plan.json', ...DEP()]);
    expect(missing.code).toBe(1);
  });
});
