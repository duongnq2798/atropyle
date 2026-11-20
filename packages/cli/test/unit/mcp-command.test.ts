import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { main } from '../../src/main';
import { memoryIo } from './memory-io';

const FIXTURE = readFileSync(new URL('../../../mcp/test/fixtures/deployment.json', import.meta.url), 'utf8');
const chainIs =
  (hex: string): typeof fetch =>
  async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: hex }));

// A down or healthy --rpc starts the server, which needs stdio: the e2e test covers that.
describe('atropyle mcp', () => {
  it('stops with WRONG_CHAIN (exit 4) for an --rpc of another chain, without printing its key', async () => {
    const io = memoryIo({ files: { 'dep.json': FIXTURE }, fetch: chainIs('0xc4') });
    const argv = ['mcp', '--rpc', 'https://rpc.example.test/key-abc', '--deployment', 'dep.json'];
    expect(await main(argv, io)).toBe(4);
    expect(io.stderr).toContain('WRONG_CHAIN');
    expect(io.stdout + io.stderr).not.toContain('key-abc');
  });

  it('refuses --json with exit 2 and one INVALID_OPTIONS object, since stdout carries MCP', async () => {
    const io = memoryIo({ files: { 'dep.json': FIXTURE } });
    expect(await main(['mcp', '--json', '--deployment', 'dep.json'], io)).toBe(2);
    expect(JSON.parse(io.stdout).error.code).toBe('INVALID_OPTIONS');
  });
});
