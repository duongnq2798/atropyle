import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, DEP, devnet, expectSchema, json, tmp } from './helpers';

describe('atropyle doctor', () => {
  it('passes on the devnet', async () => {
    const r = await cli(['doctor', '--json', ...DEP()]);
    expect(r.code, r.stdout).toBe(0);
    const out = json(r);
    expectSchema('doctor', out);
    expect(out).toMatchObject({ ok: true, chainId: 31337, integrity: { ok: true } });
    expect(out.rpcs[0]).toMatchObject({ role: 'read', ok: true, chainId: 31337 });
  });

  it('exits 4 when the RPC does not answer, and skips integrity', async () => {
    const r = await cli(['doctor', '--json', ...DEP(), '--rpc', 'http://127.0.0.1:1']);
    expect(r.code).toBe(4);
    const out = json(r);
    expectSchema('doctor', out);
    expect(out.rpcs[0]).toMatchObject({ ok: false, error: 'RPC_UNAVAILABLE', host: '127.0.0.1:1' });
    expect(out.integrity).toBeNull();
  });

  it('reports WRONG_CHAIN for an --rpc of another chain', async () => {
    const file = join(tmp(), 'other-chain.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(devnet().deploymentFile, 'utf8')), chainId: 196 }));
    const r = await cli(['doctor', '--json', '--deployment', file, '--rpc', devnet().rpcUrl]);
    expect(r.code).toBe(4);
    expect(json(r).rpcs[0]).toMatchObject({ ok: false, error: 'WRONG_CHAIN', chainId: 31337 });
  });

  it('answers a bad flag with --json with one schema-valid error and exit 2', async () => {
    const r = await cli(['doctor', '--json', '--chain', 'mars']);
    expect(r.code).toBe(2);
    const out = json(r);
    expectSchema('error', out);
    expect(out.error.code).toBe('INVALID_OPTIONS');
  });
});
