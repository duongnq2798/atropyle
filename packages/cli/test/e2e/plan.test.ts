import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { account, cli, DEP, devnet, expectSchema, json, tmp } from './helpers';

const guarded = () => [
  `--heir=${account(2)}:70`,
  `--heir=${account(5)}:30`,
  `--guardian=${account(3)}`,
  `--guardian=${account(4)}`,
  '--k=2',
  `--asset=erc20:${devnet().feeTokens[0]}`,
  `--owner=${account(1)}`,
];

describe('atropyle plan', () => {
  it('writes a plan, then checks it on chain with the current fee', async () => {
    const dir = tmp();
    const init = await cli(['plan', 'init', ...guarded(), '--drill', '--json', ...DEP()], { cwd: dir });
    expect(init.code, init.stdout).toBe(0);
    expectSchema('plan-init', json(init));
    const check = await cli(['plan', 'check', 'atropyle.plan.json', '--json', ...DEP()], { cwd: dir });
    expect(check.code, check.stdout).toBe(0);
    const out = json(check);
    expectSchema('plan-check', out);
    expect(out).toMatchObject({ ok: true, owner: account(1) });
    expect(out.fees.tokens.length).toBeGreaterThan(0);
    expect(out.tokens[0]).toMatchObject({ isContract: true });
  });

  it('checks a plan saved with a BOM and CRLF line ends', async () => {
    const dir = tmp();
    expect((await cli(['plan', 'init', ...guarded(), '--drill', ...DEP()], { cwd: dir })).code).toBe(0);
    const file = join(dir, 'atropyle.plan.json');
    writeFileSync(file, `\u{FEFF}${readFileSync(file, 'utf8').replaceAll('\n', '\r\n')}`);
    const r = await cli(['plan', 'check', 'atropyle.plan.json', '--json', ...DEP()], { cwd: dir });
    expect(r.code, r.stdout).toBe(0);
    expect(json(r).ok).toBe(true);
  });

  it('exits 1 with every issue for a wrong plan', async () => {
    const dir = tmp();
    const heirs = [
      { account: account(2), percent: 60 },
      { account: account(1), percent: 30 },
    ];
    const plan = { version: 1, owner: account(1), heirs, timing: 'sixMonths' };
    writeFileSync(join(dir, 'bad.json'), JSON.stringify(plan));
    const r = await cli(['plan', 'check', 'bad.json', '--json', ...DEP()], { cwd: dir });
    expect(r.code).toBe(1);
    const out = json(r);
    expectSchema('plan-check', out);
    expect(out.ok).toBe(false);
    expect(out.issues.map((i: { code: string }) => i.code)).toEqual(
      expect.arrayContaining(['SHARES_SUM', 'HEIR_IS_OWNER']),
    );
  });

  it('exits 1 with PLAN_INVALID for broken JSON', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'broken.json'), '{ "version": 1, ');
    const r = await cli(['plan', 'check', 'broken.json', '--json', ...DEP()], { cwd: dir });
    expect(r.code).toBe(1);
    const out = json(r);
    expectSchema('error', out);
    expect(out.error).toMatchObject({ code: 'PLAN_INVALID', details: { file: 'broken.json' } });
  });

  it('exits 1 for a bad owner in the plan file, and 2 for a bad --as', async () => {
    const dir = tmp();
    const plan = { version: 1, owner: 'not-an-address', heirs: [{ account: account(2) }], timing: 'sixMonths' };
    writeFileSync(join(dir, 'owner.json'), JSON.stringify(plan));
    const inFile = await cli(['plan', 'check', 'owner.json', '--json', ...DEP()], { cwd: dir });
    expect(inFile.code, inFile.stdout).toBe(1);
    expect(json(inFile).error.code).toBe('PLAN_INVALID');
    const flag = await cli(['plan', 'check', 'owner.json', '--as=nope', '--json', ...DEP()], { cwd: dir });
    expect(flag.code, flag.stdout).toBe(2);
    expect(json(flag).error.code).toBe('INVALID_ADDRESS');
  });

  it('exits 4 for an --rpc that does not answer, without printing its URL', async () => {
    const dir = tmp();
    expect((await cli(['plan', 'init', ...guarded(), '--drill', ...DEP()], { cwd: dir })).code).toBe(0);
    const url = 'http://127.0.0.1:1/secret-key';
    const r = await cli(['plan', 'check', 'atropyle.plan.json', '--json', ...DEP(), '--rpc', url], { cwd: dir });
    expect(r.code, r.stdout).toBe(4);
    expectSchema('error', json(r));
    expect(r.stdout + r.stderr).not.toContain('secret-key');
  });

  it('checks a plan as a Drill with --drill', async () => {
    const dir = tmp();
    const heir = `--heir=${account(2)}`;
    expect((await cli(['plan', 'init', heir, `--owner=${account(1)}`, ...DEP()], { cwd: dir })).code).toBe(0);
    const plain = await cli(['plan', 'check', 'atropyle.plan.json', '--json', ...DEP()], { cwd: dir });
    expect(json(plain).config.drill).toBe(false);
    const r = await cli(['plan', 'check', 'atropyle.plan.json', '--drill', '--json', ...DEP()], { cwd: dir });
    expect(r.code, r.stdout).toBe(0);
    expect(json(r).config.drill).toBe(true);
  });
});
