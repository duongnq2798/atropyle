import { readFileSync } from 'node:fs';
import { type AtropyleClient, AtropyleError } from '@atropyle/sdk';
import { describe, expect, it, vi } from 'vitest';
import { progressLine } from '../../src/commands/verify';
import { main } from '../../src/main';
import { memoryIo } from './memory-io';

const FIXTURE = readFileSync(new URL('../../../mcp/test/fixtures/deployment.json', import.meta.url), 'utf8');
const chainIs =
  (hex: string): typeof fetch =>
  async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: hex }));
const KEYED = 'https://rpc.example.test/key-abc123';

// Only the progress gate tests reach clientFor; the others fail inside sdkOptionsFor, before it creates a client.
const { policyRuns } = vi.hoisted(() => ({ policyRuns: { onProgress: true } }));
vi.mock('../../src/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/client')>();
  return {
    ...real,
    clientFor: async (...args: Parameters<typeof real.clientFor>) => {
      if (!policyRuns.onProgress) return real.clientFor(...args);
      return {
        deployment: { chainId: 31337, quorumRpcUrls: [['https://a.test/']] },
        verifyPolicy: async (o: { onProgress?: (d: number, t: number) => void }) => {
          o.onProgress?.(0, 100);
          o.onProgress?.(50, 100);
          o.onProgress?.(100, 100);
          throw new AtropyleError('POLICY_UNAVAILABLE');
        },
      } as unknown as AtropyleClient;
    },
  };
});

describe('verify error paths never print an --verify-rpc key', () => {
  for (const json of [false, true]) {
    for (const [name, fetch, code] of [
      ['RPC_UNAVAILABLE', undefined, 'RPC_UNAVAILABLE'],
      ['WRONG_CHAIN', chainIs('0xc4'), 'WRONG_CHAIN'],
    ] as const) {
      it(`${name}${json ? ' with --json' : ''}`, async () => {
        policyRuns.onProgress = false;
        const io = memoryIo({ files: { 'dep.json': FIXTURE }, ...(fetch ? { fetch } : {}) });
        const argv = ['verify', '--verify-rpc', KEYED, '--deployment', 'dep.json', ...(json ? ['--json'] : [])];
        expect(await main(argv, io)).toBe(4);
        expect(io.stdout + io.stderr).not.toContain('key-abc123');
        expect(io.stdout + io.stderr).toContain(code);
      });
    }
  }

  it('rejects --no-policy without --vault before any I/O, with exit 2', async () => {
    policyRuns.onProgress = false;
    const io = memoryIo({ files: {} });
    expect(await main(['verify', '--no-policy', '--deployment', 'missing.json', '--json'], io)).toBe(2);
    expect(JSON.parse(io.stdout).error.code).toBe('INVALID_OPTIONS');
  });
});

describe('progressLine', () => {
  it('writes about once per percent and ends the line', () => {
    const io = memoryIo();
    const p = progressLine(io);
    p.update(0, 1000);
    p.update(1, 1000);
    p.update(500, 1000);
    p.update(1000, 1000);
    p.done();
    expect(io.stderr.match(/\rProving P1-P8: \d+% of 1,000 combinations/g)).toHaveLength(3);
    expect(io.stderr).toContain('\rProving P1-P8: 50% of 1,000 combinations');
    expect(io.stderr.endsWith('\n')).toBe(true);
  });

  it('writes nothing when there was no update', () => {
    const io = memoryIo();
    progressLine(io).done();
    expect(io.stderr).toBe('');
  });
});

describe('verify progress gate', () => {
  const run = async (extra: string[], isTTY: boolean) => {
    policyRuns.onProgress = true;
    const io = memoryIo({ files: { 'dep.json': FIXTURE }, isTTY });
    await main(['verify', '--deployment', 'dep.json', ...extra], io);
    return io;
  };

  it('shows progress on a terminal', async () => {
    expect((await run([], true)).stderr).toContain('Proving P1-P8: 50%');
  });

  it('shows none with --json or without a terminal', async () => {
    expect((await run(['--json'], true)).stderr).not.toContain('Proving');
    expect((await run([], false)).stderr).not.toContain('Proving');
  });
});
