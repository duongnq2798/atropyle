import { readFileSync } from 'node:fs';
import type { Deployment } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { deploymentFor, sdkOptionsFor } from '../../src/client';
import type { Globals } from '../../src/globals';
import { memoryIo } from './memory-io';

const FIXTURE = readFileSync(new URL('../../../mcp/test/fixtures/deployment.json', import.meta.url), 'utf8');
const g = (o: Partial<Globals> = {}): Globals => ({
  chain: 'local',
  deployment: 'dep.json',
  json: true,
  color: false,
  verbose: false,
  ...o,
});
const chainIs =
  (hex: string): typeof fetch =>
  async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: hex }));
const io = (f?: typeof fetch) => memoryIo({ files: { 'dep.json': FIXTURE }, ...(f ? { fetch: f } : {}) });

describe('sdkOptionsFor', () => {
  it('rejects an --rpc that serves another chain', async () => {
    const e = await sdkOptionsFor(g({ rpc: 'https://rpc.example.test/key-abc' }), io(chainIs('0xc4'))).catch((x) => x);
    expect(e).toMatchObject({ code: 'WRONG_CHAIN', details: { expected: 31337, actual: 196 } });
    expect(e.message).not.toContain('key-abc');
  });

  it('uses the deployment and its own RPCs by default', async () => {
    const o = await sdkOptionsFor(g(), io());
    expect((o.chain as Deployment).chainId).toBe(31337);
    expect(o.transport).toBeUndefined();
    expect(o.verifyTransports).toBeUndefined();
    expect(o.logger).toBeUndefined();
  });

  it('builds one operator per --verify-rpc, or only the first with --single-rpc', async () => {
    const two = ['http://a.test/', 'http://b.test/'];
    expect((await sdkOptionsFor(g(), io(chainIs('0x7a69')), { verifyRpc: two })).verifyTransports).toHaveLength(2);
    expect(
      (await sdkOptionsFor(g(), io(chainIs('0x7a69')), { verifyRpc: two, singleRpc: true })).verifyTransports,
    ).toHaveLength(1);
    expect((await sdkOptionsFor(g(), io(), { singleRpc: true })).verifyTransports).toHaveLength(1);
  });

  it('refuses a --verify-rpc that is not a URL', async () => {
    const e = await sdkOptionsFor(g(), io(), { verifyRpc: ['nope'] }).catch((x) => x);
    expect(e.code).toBe('INVALID_OPTIONS');
  });

  it('logs to stderr with --verbose', async () => {
    const o = await sdkOptionsFor(g({ verbose: true }), io());
    expect(o.transport).toBeDefined();
    expect(o.logger).toBeTypeOf('function');
  });

  it('does not read the deployment file again when the caller passes the deployment', async () => {
    const counting = io();
    let reads = 0;
    const inner = counting.readFile;
    counting.readFile = (p) => {
      reads++;
      return inner(p);
    };
    const d = await deploymentFor(g(), counting);
    await sdkOptionsFor(g(), counting, { deployment: d });
    expect(reads).toBe(1);
  });
});
